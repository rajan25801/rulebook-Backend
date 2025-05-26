const db = require('../../db');
const ruleService = require('../../services/ruleService');

async function approveRule(req, res) {
  try {
    const { rule_group_id, rule_id } = req.params;
    const { comments, activateImmediately = true } = req.body;

    // Validate required parameters
    if (!rule_group_id || !rule_id) {
      return res.status(400).json({ error: 'Missing rule_group_id or rule_id' });
    }

    // Use the service to approve the rule
    const approvedBy = req.user?.username || 'system';
    const result = await ruleService.approveRule(rule_group_id, rule_id, approvedBy);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Rule not found or already approved/rejected' });
    }

    // Format the response
    const approvedRule = {
      id: result[0].id,
      name: result[0].name,
      description: result[0].description,
      status: result[0].status,
      approvedBy: result[0].approved_by,
      approvedAt: result[0].approved_at,
      ruleGroupId: result[0].rule_group_id
    };

    return res.status(200).json({
      message: 'Rule approved successfully',
      rule: approvedRule
    });
  } catch (error) {
    console.error('Error approving rule:', error);
    return res.status(500).json({ error: 'Failed to approve rule' });
  }
}

module.exports = { approveRule };
