const db = require('../../db');

async function getFactNamesForGroup(req, res) {
  const { rule_group_id } = req.params;
  try {
    const rulesResult = await db.query(
      'SELECT json_rule FROM rules WHERE rule_group_id = $1 AND is_active = TRUE',
      [rule_group_id]
    );
    const factNamesSet = new Set();
    for (const row of rulesResult.rows) {
      let jsonRule = row.json_rule;
      if (typeof jsonRule === 'string') {
        try {
          jsonRule = JSON.parse(jsonRule);
        } catch {}
      }
      if (jsonRule && jsonRule.conditions && Array.isArray(jsonRule.conditions.all)) {
        jsonRule.conditions.all.forEach(cond => {
          if (cond.fact) factNamesSet.add(cond.fact);
        });
      }
    }
    return res.status(200).json({ factNames: Array.from(factNamesSet) });
  } catch (err) {
    console.error('Error fetching fact names:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}

module.exports = { getFactNamesForGroup };
