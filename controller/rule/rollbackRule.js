const db = require('../../db');

async function rollbackRule(req, res) {
  const { rule_group_id, rule_id } = req.params;
  const {
    evaluated_by = '0',
    reason = 'Manual rollback'
  } = req.body;
  const evaluatedById = parseInt(evaluated_by, 10) || 0;
  try {
    await db.query('BEGIN');
    const traceIdResult = await db.query('SELECT gen_random_uuid() as trace_id');
    const trace_id = traceIdResult.rows[0].trace_id;
    const ruleExistsQuery = await db.query(
      'SELECT id FROM rules WHERE id = $1 AND rule_group_id = $2',
      [rule_id, rule_group_id]
    );
    if (ruleExistsQuery.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({
        error: 'Rule not found',
        details: `No rule found with id ${rule_id} in group ${rule_group_id}`
      });
    }
    const { rows: currentRows } = await db.query(
      `SELECT r.*, (SELECT COUNT(*) FROM rules WHERE name = r.name AND rule_group_id = r.rule_group_id) as version_count
       FROM rules r WHERE r.id = $1 AND r.rule_group_id = $2 AND r.is_active = true`,
      [rule_id, rule_group_id]
    );
    if (currentRows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        error: 'Rule is inactive',
        details: 'Cannot rollback an inactive rule'
      });
    }
    const currentRule = currentRows[0];
    if (!currentRule.is_latest) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        error: 'Not latest version',
        details: 'Can only rollback from the latest version'
      });
    }
    if (currentRule.version <= 1) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot rollback',
        details: 'This is the first version of the rule'
      });
    }
    const { rows: prevRows } = await db.query(
      'SELECT * FROM rules WHERE rule_group_id = $1 AND name = $2 AND version = $3 AND is_active = true',
      [rule_group_id, currentRule.name, currentRule.version - 1]
    );
    if (!prevRows.length) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        error: 'Previous version not found',
        details: `Cannot find version ${currentRule.version - 1} of this rule`
      });
    }
    const previousRule = prevRows[0];
    await db.query('UPDATE rules SET is_latest = false WHERE id = $1', [currentRule.id]);
    await db.query('UPDATE rules SET is_latest = true WHERE id = $1', [previousRule.id]);
    await db.query(
      `INSERT INTO rule_tags_map (rule_id,tag_id,created_by,updated_by,created_by_tool,updated_by_tool)
       SELECT $1,tag_id,$2,$2,'system','system' FROM rule_tags_map WHERE rule_id=$3`,
      [previousRule.id, evaluatedById, currentRule.id]
    );
    await db.query(
      `INSERT INTO rule_parameter_map (rule_id,parameter_id,created_by,updated_by,created_by_tool,updated_by_tool)
       SELECT $1,parameter_id,$2,$2,'system','system' FROM rule_parameter_map WHERE rule_id=$3`,
      [previousRule.id, evaluatedById, currentRule.id]
    );
    // Store rollback event (storeRuleEvent should be imported if needed)
    await db.query(
      `INSERT INTO rule_evaluation_logs (
        rule_id, rule_group_id, input_payload, evaluated_by, trace_id,
        version, created_by, updated_by, created_by_tool, updated_by_tool,
        action, action_type, action_value
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'system','system',$9,$10,$11)`,
      [
        previousRule.id,
        rule_group_id,
        JSON.stringify({ reason, from_version: currentRule.version, to_version: previousRule.version }),
        evaluatedById,
        trace_id,
        previousRule.version,
        evaluatedById,
        evaluatedById,
        'Rollback to previous version',
        'rollback',
        previousRule.action_value
      ]
    );
    await db.query('COMMIT');
    return res.json({
      message: 'Rollback successful',
      rolledBackTo: {
        id: previousRule.id,
        name: previousRule.name,
        description: previousRule.description,
        json_rule: previousRule.json_rule,
        version: previousRule.version,
        from_version: currentRule.version,
        is_latest: true,
        is_active: true,
        trace_id
      }
    });
  } catch (err) {
    console.error('Error during rollback:', err);
    await db.query('ROLLBACK');
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

module.exports = { rollbackRule };
