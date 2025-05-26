const db = require('../../db');

async function viewHistory(req, res) {
  const rule_id = req.params.rule_id ? parseInt(req.params.rule_id, 10) : undefined;
  const rule_group_id = req.params.rule_group_id ? parseInt(req.params.rule_group_id, 10) : undefined;
  const version = req.query.version ? parseInt(req.query.version, 10) : undefined;
  try {
    if (!rule_id || !rule_group_id) {
      return res.status(400).json({ error: 'Missing rule_id or rule_group_id' });
    }
    const ruleRes = await db.query(
      'SELECT name, rule_group_id FROM rules WHERE id = $1 AND rule_group_id = $2',
      [rule_id, rule_group_id]
    );
    if (ruleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    const ruleName = ruleRes.rows[0].name;
    let query = `
      SELECT re.*,
             r.name AS rule_name,
             r.version,
             rg.name AS rule_group_name
      FROM rule_events re
      JOIN rules r ON re.aggregate_id = r.id
      JOIN rule_groups rg ON r.rule_group_id = rg.id
      WHERE r.name = $1 AND r.rule_group_id = $2
    `;
    const queryParams = [ruleName, rule_group_id];
    if (version && !isNaN(version)) {
      query += ' AND r.version = $3';
      queryParams.push(version);
    }
    query += ' ORDER BY re.created_at DESC, re.sequence_number DESC';
    const historyResult = await db.query(query, queryParams);
    if (historyResult.rows.length === 0) {
      return res.status(404).json({
        error: 'No history found',
        details: version
          ? `No events found for version ${version}`
          : `No events found for rule '${ruleName}' in group ${rule_group_id}`
      });
    }
    const response = {
      rule_name: ruleName,
      rule_group_id,
      total_events: historyResult.rows.length,
      history: historyResult.rows.map(event => ({
        event_id: event.id,
        event_type: event.event_type,
        rule_id: event.aggregate_id,
        rule_name: event.rule_name,
        rule_group_name: event.rule_group_name,
        version: event.version,
        sequence_number: event.sequence_number,
        event_data: event.event_data,
        metadata: event.metadata,
        created_at: new Date(event.created_at).toISOString()
      }))
    };
    return res.json(response);
  } catch (err) {
    console.error('Error fetching history:', err);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

module.exports = { viewHistory };
