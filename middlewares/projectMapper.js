const db = require('../db');

async function projectMiddleware(req, res, next) {
  // Accept rule_group_id from params or body
  let rule_group_id = req.params.rule_group_id;
  if (!rule_group_id && req.body && req.body.rule_group_id) {
    rule_group_id = req.body.rule_group_id;
  }

  const groupId = parseInt(rule_group_id, 10);
  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid rule_group_id parameter' });
  }

  const { rows } = await db.query(
    `SELECT id,name FROM rule_groups WHERE id=$1 AND is_active=TRUE`,
    [groupId]
  );
  if (!rows.length) {
    return res.status(404).json({ error: 'Rule Group not found' });
  }

  req.ruleGroup   = rows[0];
  req.ruleGroupId = rows[0].id;
  next();
}
module.exports = projectMiddleware;
