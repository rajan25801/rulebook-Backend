const pool = require('../../db');

async function getDraftsByGroup(req, res) {
  const { rule_group_id } = req.params;

  try {
    const query = `
      SELECT id, rule_group_id, name, description, submission_status, created_by, updated_by, updated_at
      FROM rule_drafts
      WHERE rule_group_id = $1 AND submission_status = 'drafted'
      ORDER BY updated_at DESC
    `;
    const result = await pool.query(query, [rule_group_id]);

    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch drafts.',
      details: error.message
    });
  }
}

module.exports = { getDraftsByGroup };
