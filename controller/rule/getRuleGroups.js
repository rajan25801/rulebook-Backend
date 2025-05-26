const db = require('../../db');

async function getRuleGroups(req, res) {
  const { page = 1, limit = 10, search = '' } = req.query;
  if (isNaN(page) || isNaN(limit) || page <= 0 || limit <= 0) {
    return res.status(400).json({ error: 'Invalid page or limit parameter' });
  }
  try {
    const offset = (page - 1) * limit;
    const queryParams = [`%${search}%`, limit, offset];
    const query = `
      SELECT id, name, description, execution_type, version, is_active,
             created_by, updated_by, created_by_tool, updated_by_tool, created_at, updated_at
      FROM rule_groups
      WHERE name ILIKE $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, queryParams);
    return res.status(200).json({
      page: Number(page),
      limit: Number(limit),
      total: result.rowCount,
      rule_groups: result.rows
    });
  } catch (err) {
    console.error('Error fetching rule groups:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}

module.exports = { getRuleGroups };
