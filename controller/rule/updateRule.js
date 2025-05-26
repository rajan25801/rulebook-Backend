const db = require('../../db');

async function updateRule(req, res) {
  const rule_id = parseInt(req.params.rule_id, 10);
  const rule_group_id = parseInt(req.params.rule_group_id, 10);
  const {
    json_rule,
    description,
    name,
    tags,
    parameters,
    action_type,
    action_value,
    priority,
    evaluated_by,
    input_payload = {}
  } = req.body;
  let evaluatedByInt = parseInt(evaluated_by, 10);
  if (isNaN(evaluatedByInt)) {
    evaluatedByInt = 0;
  }
  const updatedFields = [];
  if (json_rule !== undefined) updatedFields.push('json_rule');
  if (description !== undefined) updatedFields.push('description');
  if (name !== undefined) updatedFields.push('name');
  if (action_type !== undefined) updatedFields.push('action_type');
  if (action_value !== undefined) updatedFields.push('action_value');
  if (priority !== undefined) updatedFields.push('priority');
  if (tags !== undefined) updatedFields.push('tags');
  if (parameters !== undefined) updatedFields.push('parameters');
  if (updatedFields.length === 0) {
    return res.status(400).json({
      error: 'No fields specified for update',
      message: 'Please provide at least one field to update'
    });
  }
  try {
    await db.query('BEGIN');
    const traceIdResult = await db.query('SELECT gen_random_uuid() as trace_id');
    const trace_id = traceIdResult.rows[0].trace_id;
    const { rows } = await db.query(
      'SELECT * FROM rules WHERE id = $1 AND rule_group_id = $2 AND is_active = true AND is_latest = true',
      [rule_id, rule_group_id]
    );
    if (!rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Rule not found or already inactive' });
    }
    const existingRule = rows[0];
    const changes = {};
    if (json_rule !== undefined) {
      changes.json_rule = { old: existingRule.json_rule, new: json_rule };
    }
    await db.query('UPDATE rules SET is_latest = false WHERE id = $1', [rule_id]);
    const parsedPriority = priority !== undefined ? parseInt(priority, 10) : existingRule.priority;
    const newRuleRes = await db.query(
      `INSERT INTO rules (
                name, description, json_rule, rule_group_id, version,
                is_latest, is_active, created_by, updated_by, created_by_tool, updated_by_tool,
                action_type, action_value, priority
            ) VALUES ($1,$2,$3,$4,$5,true,true,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *`,
      [
        name ?? existingRule.name,
        description ?? existingRule.description,
        json_rule ?? existingRule.json_rule,
        rule_group_id,
        existingRule.version + 1,
        evaluatedByInt,
        evaluatedByInt,
        existingRule.created_by_tool || 'system',
        'system',
        action_type ?? existingRule.action_type,
        action_value ?? existingRule.action_value,
        parsedPriority
      ]
    );
    const newRule = newRuleRes.rows[0];
    if (tags !== undefined) {
      const validTags = tags.filter(t => t && t.name && t.name.trim() !== '');
      for (const t of validTags) {
        const tagRes = await db.query(
          `INSERT INTO rule_tags (name,description,created_by,updated_by)
                     VALUES($1,$2,$3,$3)
                     ON CONFLICT(name) DO UPDATE
                     SET description=EXCLUDED.description,
                         updated_at=CURRENT_TIMESTAMP
                     RETURNING id`,
          [t.name, t.description, evaluated_by]
        );
        await db.query(
          `INSERT INTO rule_tags_map
                     (rule_id,tag_id,created_by,updated_by,created_by_tool,updated_by_tool)
                     VALUES($1,$2,$3,$3,'system','system')
                     ON CONFLICT DO NOTHING`,
          [newRule.id, tagRes.rows[0].id, evaluated_by]
        );
      }
    } else {
      await db.query(
        `INSERT INTO rule_tags_map (rule_id,tag_id,created_by,updated_by,created_by_tool,updated_by_tool)
                 SELECT $1,tag_id,$2,$2,'system','system'
                 FROM rule_tags_map WHERE rule_id=$3`,
        [newRule.id, evaluated_by, rule_id]
      );
    }
    // Store the main update event (storeRuleEvent should be imported if needed)
    // await storeRuleEvent(...)
    await db.query(
      `INSERT INTO rule_evaluation_logs (
                rule_id, rule_group_id, input_payload, evaluated_by, trace_id,
                version, created_by, updated_by, created_by_tool, updated_by_tool,
                action, action_type, action_value
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'system','system',$9,$10,$11)`,
      [
        newRule.id,
        rule_group_id,
        JSON.stringify({ ...input_payload, updated_fields: updatedFields }),
        evaluated_by,
        trace_id,
        newRule.version,
        evaluated_by,
        evaluated_by,
        `Updated fields: ${updatedFields.join(', ')}`,
        'update',
        newRule.action_value
      ]
    );
    await db.query('COMMIT');
    return res.json({
      message: 'Rule updated successfully',
      rule: newRule,
      updated_fields: updatedFields,
      trace_id,
      events: {
        main: 'RULE_UPDATED',
        specific: updatedFields.map(field => `${field.toUpperCase()}_UPDATED`)
      }
    });
  } catch (err) {
    console.error('Error updating rule:', err);
    await db.query('ROLLBACK');
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { updateRule };
