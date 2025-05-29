const pool = require('../../db');

async function getDraftRuleById(req, res) {
  const { rule_group_id, draft_id } = req.params;
  let client;
  try {
    client = await pool.connect();

    const draftQuery = `
      SELECT *
      FROM rule_drafts
      WHERE id = $1 AND rule_group_id = $2
    `;
    const result = await client.query(draftQuery, [draft_id, rule_group_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Draft not found.' });
    }

    const draft = result.rows[0];

    // Ensure json_rule is parsed if needed
    if (typeof draft.json_rule === 'string') {
      try {
        draft.json_rule = JSON.parse(draft.json_rule);
      } catch (err) {
        console.error('Failed to parse json_rule:', err);
        return res.status(500).json({ message: 'Invalid JSON in json_rule.' });
      }
    }

    return res.status(200).json(draft);

  } catch (error) {
    console.error('Error fetching draft rule:', error);
    return res.status(500).json({ message: 'Internal server error.', details: error.message });
  } finally {
    if (client) client.release();
  }
}

module.exports = { getDraftRuleById };
