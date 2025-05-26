const ruleService = require('../../services/ruleService');

async function getAllPendingRules(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const results = await ruleService.getAllPendingRules();
    const formattedResults = results.map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      version: rule.version,
      ruleGroupId: rule.rule_group_id,
      ruleGroupName: rule.rule_group_name || `Group ${rule.rule_group_id}`,
      createdBy: rule.created_by,
      updatedBy: rule.updated_by,
      createdAt: rule.created_at,
      updatedAt: rule.updated_at,
      priority: rule.priority || 3,
      tags: rule.tags || [],
      ruleLogic: rule.json_rule ?
        typeof rule.json_rule === 'string' ?
          rule.json_rule : JSON.stringify(rule.json_rule, null, 2)
        : null
    }));
    return res.status(200).json({
      rules: formattedResults,
      total: formattedResults.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error getting all pending rules:', error);
    return res.status(500).json({ error: 'Failed to fetch pending rules' });
  }
}

module.exports = { getAllPendingRules };
