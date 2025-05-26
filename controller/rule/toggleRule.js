const db = require('../../db');

async function toggleRule(req, res) {
  const { rule_id, enabled } = req.params;
  const selectedWorkspace = req.selectedWorkspace;
  const groupNames = req.groupNames;
  if (enabled !== 'true' && enabled !== 'false') {
    return res.status(400).json({ error: '\'enabled\' must be \'true\' or \'false\'' });
  }
  const isEnabled = enabled === 'true';
  try {
    const ruleQuery = 'SELECT * FROM rules WHERE rule_id = $1 AND is_active = true';
    const ruleResult = await db.query(ruleQuery, [rule_id]);
    if (ruleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active rule not found for given rule_id' });
    }
    const rule = ruleResult.rows[0];
    if (!groupNames.includes(rule.group_name)) {
      return res.status(403).json({ error: `Rule does not belong to workspace \"${selectedWorkspace}\"` });
    }
    await db.query('UPDATE rules SET enabled = $1 WHERE id = $2', [isEnabled, rule.id]);
    await db.query(
      `INSERT INTO rule_events (rule_id, event_type, payload, created_at)
       VALUES ($1, 'TOGGLE', $2, NOW())`,
      [rule_id, rule]
    );
    res.json({
      message: `Rule (version ${rule.version}) ${isEnabled ? 'enabled' : 'disabled'} successfully`,
      rule_id,
      version: rule.version
    });
  } catch (err) {
    console.error('Error toggling rule:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { toggleRule };
