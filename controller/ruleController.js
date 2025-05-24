const db = require('../db');
const pool = require('../db');
const { Engine } = require('json-rules-engine');

// Add event types enum at the top of file
const EVENT_TYPES = {
    RULE_CREATED: 'RULE_CREATED',
    RULE_UPDATED: 'RULE_UPDATED',
    RULE_ROLLED_BACK: 'RULE_ROLLED_BACK',
    TAGS_UPDATED: 'TAGS_UPDATED',
    PARAMETERS_UPDATED: 'PARAMETERS_UPDATED'
};

// Add event store function
async function storeRuleEvent(eventType, ruleId, data, metadata, client = db) {
    const eventRes = await client.query(
        `INSERT INTO rule_events (
            event_type, aggregate_id, event_data, metadata, sequence_number
        ) VALUES (
            $1, $2, $3, $4,
            (SELECT COALESCE(MAX(sequence_number), 0) + 1 
             FROM rule_events 
             WHERE aggregate_id = $2)
        ) RETURNING *`,
        [eventType, ruleId, JSON.stringify(data), JSON.stringify(metadata)]
    );
    return eventRes.rows[0];
}

//create new rule_group
exports.createRule = async (req, res) => {
    let client; // Ensure client is defined at the top
    try {
        const { rule_group_id } = req.params;
        const { name, description, json_rule, parameters, tags, created_by } = req.body;

        // Validate required fields
        if (!name || !json_rule) {
            return res.status(400).json({ message: 'Name and JSON rule are required.' });
        }

        client = await pool.connect(); // Initialize client
        await client.query('BEGIN');

        // Insert rule into the rules table
        const ruleQuery = `
            INSERT INTO rules (rule_group_id, name, description, json_rule, created_by, updated_by, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $5, NOW(), NOW()) RETURNING id
        `;
        const ruleValues = [
            rule_group_id,
            name,
            description || null,
            JSON.stringify(json_rule),
            created_by || 'system',
        ];

        const ruleResult = await client.query(ruleQuery, ruleValues);
        const ruleId = ruleResult.rows[0].id;

        // Map frontend data types to database enum values
        const dataTypeMapping = {
            STRING: 'STRING',
            NUMBER: 'INT',
            FLOAT: 'FLOAT',
            BOOLEAN: 'BOOLEAN',
            DATE: 'DATE'
        };

        // Insert parameters into the rule_parameters table and map them to the rule
        if (parameters && parameters.length > 0) {
            for (const param of parameters) {
                const dbDataType = dataTypeMapping[param.data_type];
                if (!dbDataType) {
                    throw new Error(`Invalid data_type: ${param.data_type}. Valid values are: ${Object.keys(dataTypeMapping).join(', ')}`);
                }

                const paramQuery = `
                    INSERT INTO rule_parameters (name, data_type, description, is_required, default_value, created_by, updated_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $6, NOW(), NOW())
                    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id
                `;
                const paramValues = [
                    param.name,
                    dbDataType,
                    param.description || '',
                    param.is_required || false,
                    param.default_value || null,
                    created_by || 'system',
                ];
                const paramResult = await client.query(paramQuery, paramValues);
                const paramId = paramResult.rows[0].id;

                const paramMapQuery = `
                    INSERT INTO rule_parameter_map (rule_id, parameter_id, created_by, updated_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $3, NOW(), NOW())
                    ON CONFLICT DO NOTHING
                `;
                await client.query(paramMapQuery, [ruleId, paramId, created_by || 'system']);
            }
        }

        // Insert tags into the rule_tags table and map them to the rule
        if (tags && tags.length > 0) {
            for (const tag of tags) {
                const tagQuery = `
                    INSERT INTO rule_tags (name, description, created_by, updated_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $3, NOW(), NOW())
                    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id
                `;
                const tagValues = [
                    tag.name,
                    tag.description || '',
                    created_by || 'system',
                ];
                const tagResult = await client.query(tagQuery, tagValues);
                const tagId = tagResult.rows[0].id;

                const tagMapQuery = `
                    INSERT INTO rule_tags_map (rule_id, tag_id, created_by, updated_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $3, NOW(), NOW())
                    ON CONFLICT DO NOTHING
                `;
                await client.query(tagMapQuery, [ruleId, tagId, created_by || 'system']);
            }
        }

        await client.query('COMMIT');
        return res.status(201).json({ message: 'Rule created successfully.', rule_id: ruleId });
    } catch (error) {
        console.error('Error creating rule:', error);
        if (client) await client.query('ROLLBACK');
        return res.status(500).json({ message: 'Internal server error.', details: error.message });
    } finally {
        if (client) client.release();
    }
};

// exports.addRule = async (req, res) => {
//     const { rule_group_id } = req.params;
//     const {
//         name,
//         description,
//         json_rule, 
//         parameters = [],
//         tags = [],
//         evaluated_by = 'system',
//         priority
//     } = req.body;

//     if (!name || !json_rule || !rule_group_id) {
//         return res.status(400).json({
//             error: 'Missing required fields',
//             details: 'name, json_rule, and rule_group_id are required'
//         });
//     }

//     const client = await pool.connect();
//     try {
//         await client.query('BEGIN');

//         // 1. Insert the rule
//         // Parse priority as integer if provided
//         const parsedPriority = priority !== undefined ? parseInt(priority, 10) : 9999;
//         const ruleRes = await client.query(
//             `INSERT INTO rules (
//                 name, description, json_rule, rule_group_id,
//                 version, is_active, is_latest,
//                 created_by, updated_by, created_by_tool, updated_by_tool, priority
//             ) VALUES ($1,$2,$3,$4,1,TRUE,TRUE,$5,$5,'system','system',$6)
//             RETURNING *`,
//             [name, description, JSON.stringify(json_rule), rule_group_id, evaluated_by, parsedPriority]
//         );

//         const newRule = ruleRes.rows[0];

//         // Insert tags and map to rule
//         if (tags && tags.length > 0) {
//             for (const t of tags) {
//                 // Insert tag if not exists
//                 const tagRes = await client.query(
//                     `INSERT INTO rule_tags (name, description, created_by, updated_by)
//                      VALUES ($1, $2, $3, $3)
//                      ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description RETURNING id`,
//                     [t.name, t.description || '', evaluated_by]
//                 );
//                 // Map tag to rule
//                 await client.query(
//                     `INSERT INTO rule_tags_map (rule_id, tag_id, created_by, updated_by, created_by_tool, updated_by_tool)
//                      VALUES ($1, $2, $3, $3, 'system', 'system') ON CONFLICT DO NOTHING`,
//                     [newRule.id, tagRes.rows[0].id, evaluated_by]
//                 );
//             }
//         }

//         // Insert parameters and map to rule
//         if (parameters && parameters.length > 0) {
//             for (const p of parameters) {
//                 // Insert parameter if not exists
//                 const paramRes = await client.query(
//                     `INSERT INTO rule_parameters (name, data_type, description, is_required, default_value, created_by, updated_by)
//                      VALUES ($1, $2, $3, $4, $5, $6, $6)
//                      ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description RETURNING id`,
//                     [p.name, p.data_type || 'string', p.description || '', p.is_required || false, p.default_value || '', evaluated_by]
//                 );
//                 // Map parameter to rule
//                 await client.query(
//                     `INSERT INTO rule_parameter_map (rule_id, parameter_id, created_by, updated_by, created_by_tool, updated_by_tool)
//                      VALUES ($1, $2, $3, $3, 'system', 'system') ON CONFLICT DO NOTHING`,
//                     [newRule.id, paramRes.rows[0].id, evaluated_by]
//                 );
//             }
//         }

//         // 2. Store creation event in rule_events
//         await storeRuleEvent(
//             EVENT_TYPES.RULE_CREATED,
//             newRule.id,
//             {
//                 name,
//                 description,
//                 json_rule,
//                 parameters,
//                 tags,
//                 rule_group_id,
//                 version: 1
//             },
//             {
//                 evaluated_by,
//                 timestamp: new Date(),
//                 trace_id: await client.query("SELECT gen_random_uuid() as trace_id")
//                     .then(res => res.rows[0].trace_id)
//             },
//             client
//         );

//         await client.query('COMMIT');

//         return res.status(201).json({
//             message: 'Rule created successfully',
//             rule: {
//                 id: newRule.id,
//                 name: newRule.name,
//                 version: 1
//             }
//         });

//     } catch (err) {
//         await client.query('ROLLBACK');
//         console.error('Error adding rule:', err);
//         return res.status(500).json({
//             error: 'Internal server error',
//             details: err.message
//         });
//     } finally {
//         client.release();
//     }
// };






exports.updateRule = async (req, res) => {
    const rule_id = parseInt(req.params.rule_id, 10);
    const rule_group_id = parseInt(req.params.rule_group_id, 10);
    
    // Destructure with all fields optional except evaluated_by
    const {
        json_rule,          // Optional
        description,         // Optional
        name,               // Optional
        tags,               // Optional
        parameters,         // Optional
        action_type,        // Optional
        action_value,       // Optional
        priority,           // Optional
        evaluated_by,       // Required
        input_payload = {}  // Optional with default empty object
    } = req.body;

    // Only evaluated_by is mandatory
    // Ensure evaluated_by is always an integer
    let evaluatedByInt = parseInt(evaluated_by, 10);
    if (isNaN(evaluatedByInt)) {
        evaluatedByInt = 0; // fallback to 0 for system actions or invalid input
    }

    // Track what fields are being updated - only count fields that are provided
    const updatedFields = [];
    if (json_rule !== undefined) updatedFields.push('json_rule');
    if (description !== undefined) updatedFields.push('description');
    if (name !== undefined) updatedFields.push('name');
    if (action_type !== undefined) updatedFields.push('action_type');
    if (action_value !== undefined) updatedFields.push('action_value');
    if (priority !== undefined) updatedFields.push('priority');
    if (tags !== undefined) updatedFields.push('tags');
    if (parameters !== undefined) updatedFields.push('parameters');

    // At least one field must be updated
    if (updatedFields.length === 0) {
        return res.status(400).json({ 
            error: 'No fields specified for update',
            message: 'Please provide at least one field to update'
        });
    }

    try {
        await db.query('BEGIN');
        
        // Generate trace_id automatically
        const traceIdResult = await db.query("SELECT gen_random_uuid() as trace_id");
        const trace_id = traceIdResult.rows[0].trace_id;

        // Fetch existing rule
        const { rows } = await db.query(
            `SELECT * FROM rules WHERE id = $1 AND rule_group_id = $2 AND is_active = true AND is_latest = true`,
            [rule_id, rule_group_id]
        );

        if (!rows.length) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Rule not found or already inactive' });
        }
        const existingRule = rows[0];

        // Track what fields are being updated
        const changes = {};

        if (json_rule !== undefined) {
            changes.json_rule = {old: existingRule.json_rule, new: json_rule};
        }

        // Deactivate old rule version
        await db.query(`UPDATE rules SET is_latest = false WHERE id = $1`, [rule_id]);

        // Parse priority as integer if provided
        const parsedPriority = priority !== undefined ? parseInt(priority, 10) : existingRule.priority;

        // Create new version with modified query to handle string values
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
                evaluatedByInt,  // Use integer for created_by
                evaluatedByInt,  // Use integer for updated_by
                existingRule.created_by_tool || 'system',
                'system',
                action_type ?? existingRule.action_type,
                action_value ?? existingRule.action_value,
                parsedPriority
            ]
        );
        const newRule = newRuleRes.rows[0];

        // Handle tags if provided
        if (tags !== undefined) {
            // Filter out tags with no name
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
            // Copy existing tags
            await db.query(
                `INSERT INTO rule_tags_map (rule_id,tag_id,created_by,updated_by,created_by_tool,updated_by_tool)
                 SELECT $1,tag_id,$2,$2,'system','system'
                 FROM rule_tags_map WHERE rule_id=$3`,
                [newRule.id, evaluated_by, rule_id]
            );
        }

        // Store the main update event
        await storeRuleEvent(
            EVENT_TYPES.RULE_UPDATED,
            rule_id,
            {
                changes,
                updatedFields,
                newVersion: existingRule.version + 1
            },
            {
                evaluated_by,
                timestamp: new Date(),
                trace_id
            },
            db
        );

        // If json_rule was updated, store specific event
        if (json_rule !== undefined) {
            await storeRuleEvent(
                EVENT_TYPES.RULE_UPDATED, // Use a valid event type
                rule_id,
                {
                    oldJsonRule: existingRule.json_rule,
                    newJsonRule: json_rule,
                    version: existingRule.version + 1
                },
                {
                    evaluated_by,
                    timestamp: new Date(),
                    trace_id
                },
                db
            );
        }

        // If tags were updated, store specific event
        if (tags !== undefined) {
            await storeRuleEvent(
                EVENT_TYPES.TAGS_UPDATED,
                rule_id,
                {
                    tags,
                    version: existingRule.version + 1
                },
                {
                    evaluated_by,
                    timestamp: new Date(),
                    trace_id
                },
                db
            );
        }

        // Log the update
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
                main: EVENT_TYPES.RULE_UPDATED,
                specific: updatedFields.map(field => `${field.toUpperCase()}_UPDATED`)
            }
        });

    } catch (err) {
        console.error('Error updating rule:', err);
        await db.query('ROLLBACK');
        return res.status(500).json({ error: 'Internal server error' });
    }
};



exports.rollbackRule = async (req, res) => {
    const { rule_group_id, rule_id } = req.params;
    // Convert evaluated_by to number if it's a string, default to 0
    const { 
        evaluated_by = '0',  // Default to '0' instead of 'system'
        reason = 'Manual rollback' 
    } = req.body;

    // Convert evaluated_by to integer
    const evaluatedById = parseInt(evaluated_by, 10) || 0;

    try {
        await db.query('BEGIN');

        // Generate trace_id
        const traceIdResult = await db.query("SELECT gen_random_uuid() as trace_id");
        const trace_id = traceIdResult.rows[0].trace_id;

        // 1. First check if rule exists at all
        const ruleExistsQuery = await db.query(
            `SELECT id FROM rules WHERE id = $1 AND rule_group_id = $2`,
            [rule_id, rule_group_id]
        );

        if (ruleExistsQuery.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ 
                error: 'Rule not found',
                details: `No rule found with id ${rule_id} in group ${rule_group_id}`
            });
        }

        // 2. Fetch current (latest + active) rule with more details
        const { rows: currentRows } = await db.query(
            `SELECT r.*, 
                    (SELECT COUNT(*) FROM rules 
                     WHERE name = r.name 
                     AND rule_group_id = r.rule_group_id) as version_count
             FROM rules r
             WHERE r.id = $1
             AND r.rule_group_id = $2
             AND r.is_active = true`,
            [rule_id, rule_group_id]
        );

        // Handle different error cases
        if (currentRows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Rule is inactive',
                details: 'Cannot rollback an inactive rule'
            });
        }

        const currentRule = currentRows[0];

        if (!currentRule.is_latest) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Not latest version',
                details: 'Can only rollback from the latest version'
            });
        }

        if (currentRule.version <= 1) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Cannot rollback',
                details: 'This is the first version of the rule'
            });
        }

        // 3. Fetch previous version with additional validation
        const { rows: prevRows } = await db.query(
            `SELECT * FROM rules 
             WHERE rule_group_id = $1
             AND name = $2
             AND version = $3
             AND is_active = true`,
            [rule_group_id, currentRule.name, currentRule.version - 1]
        );

        if (!prevRows.length) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Previous version not found',
                details: `Cannot find version ${currentRule.version - 1} of this rule`
            });
        }

        const previousRule = prevRows[0];

        // 3. Deactivate current version
        await db.query(
            `UPDATE rules SET is_latest = false WHERE id = $1`,
            [currentRule.id]
        );

        // 4. Reactivate previous version
        await db.query(
            `UPDATE rules SET is_latest = true WHERE id = $1`,
            [previousRule.id]
        );

        // 5. Copy tags from current to previous if they exist
        await db.query(
            `INSERT INTO rule_tags_map (rule_id,tag_id,created_by,updated_by,created_by_tool,updated_by_tool)
             SELECT $1,tag_id,$2,$2,'system','system'
             FROM rule_tags_map WHERE rule_id=$3`,
            [previousRule.id, evaluatedById, currentRule.id]
        );

        // 6. Copy parameters from current to previous if they exist
        await db.query(
            `INSERT INTO rule_parameter_map (rule_id,parameter_id,created_by,updated_by,created_by_tool,updated_by_tool)
             SELECT $1,parameter_id,$2,$2,'system','system'
             FROM rule_parameter_map WHERE rule_id=$3`,
            [previousRule.id, evaluatedById, currentRule.id]
        );

        // 7. Store rollback event
        await storeRuleEvent(
            EVENT_TYPES.RULE_ROLLED_BACK,
            rule_id,
            {
                from_version: currentRule.version,
                to_version: previousRule.version,
                reason: reason
            },
            {
                evaluated_by: evaluatedById,
                timestamp: new Date(),
                trace_id
            },
            db
        );

        // 8. Log the rollback in evaluation logs
        await db.query(
            `INSERT INTO rule_evaluation_logs (
                rule_id, rule_group_id, input_payload, evaluated_by, trace_id,
                version, created_by, updated_by, created_by_tool, updated_by_tool,
                action, action_type, action_value
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'system','system',$9,$10,$11)`,
            [
                previousRule.id,
                rule_group_id,
                JSON.stringify({ 
                    reason,
                    from_version: currentRule.version,
                    to_version: previousRule.version
                }),
                evaluatedById,
                trace_id,
                previousRule.version,
                evaluatedById,
                evaluatedById,
                'Rollback to previous version',
                'rollback',
                previousRule.action_value
            ]
        );

        await db.query('COMMIT');

        return res.json({
            message: 'Rollback successful',
            rolledBackTo: {
                id: previousRule.id,
                name: previousRule.name,
                description: previousRule.description,
                json_rule: previousRule.json_rule,
                version: previousRule.version,
                from_version: currentRule.version,
                is_latest: true,
                is_active: true,
                trace_id
            }
        });

    } catch (err) {
        console.error('Error during rollback:', err);
        await db.query('ROLLBACK');
        return res.status(500).json({ 
            error: 'Internal server error',
            details: err.message
        });
    }
};



// exports.viewHistory = async (req, res) => {
//     const rule_id = req.params.rule_id ? parseInt(req.params.rule_id, 10) : undefined;
//     const rule_group_id = req.params.rule_group_id ? parseInt(req.params.rule_group_id, 10) : undefined;
//     const version = req.params.version ? parseInt(req.params.version, 10) : undefined;

//     try {
//         // If version is specified, fetch from rules table
//         if (version) {
//             const result = await db.query(
//                 `SELECT 
//                     r.*,
//                     rg.name as rule_group_name,
//                     rg.execution_type as rule_group_execution_type
//                 FROM rules r
//                 JOIN rule_groups rg ON r.rule_group_id = rg.id
//                 WHERE r.id = $1 
//                 AND r.rule_group_id = $2
//                 AND r.version = $3
//                 AND r.is_active = true`,
//                 [rule_id, rule_group_id, version]
//             );

//             if (result.rows.length === 0) {
//                 return res.status(404).json({
//                     error: 'Version not found',
//                     details: `Version ${version} not found for rule ${rule_id}`
//                 });
//             }

//             const rule = result.rows[0];
//             return res.json({
//                 rule_id: rule.id,
//                 rule_group_id: rule.rule_group_id,
//                 name: rule.name,
//                 description: rule.description,
//                 json_rule: rule.json_rule,
//                 version: rule.version,
//                 is_active: rule.is_active,
//                 is_latest: rule.is_latest,
//                 created_at: rule.created_at,
//                 updated_at: rule.updated_at,
//                 rule_group_name: rule.rule_group_name,
//                 execution_type: rule.rule_group_execution_type
//             });
//         }

//         // Otherwise, fetch event history from rule_events table
//         let query = `
//             SELECT re.*,
//                    r.name as rule_name,
//                    r.version,
//                    rg.name as rule_group_name
//             FROM rule_events re
//             LEFT JOIN rules r ON re.aggregate_id = r.id
//             LEFT JOIN rule_groups rg ON r.rule_group_id = rg.id
//             WHERE 1=1
//         `;
//         const queryParams = [];
//         let paramCount = 1;

//         // Add optional filters with type checking
//         if (rule_id && !isNaN(rule_id)) {
//             query += ` AND re.aggregate_id = $${paramCount}`;
//             queryParams.push(rule_id);
//             paramCount++;
//         }

//         if (rule_group_id && !isNaN(rule_group_id)) {
//             query += ` AND r.rule_group_id = $${paramCount}`;
//             queryParams.push(rule_group_id);
//             paramCount++;
//         }

//         // Add version filter if provided
//         if (version && !isNaN(version)) {
//             query += ` AND r.version = $${paramCount}`;
//             queryParams.push(version);
//             paramCount++;
//         }

//         // Add sorting
//         query += ` ORDER BY re.created_at DESC, re.sequence_number DESC`;

//         const historyResult = await db.query(query, queryParams);

//         if (historyResult.rows.length === 0) {
//             return res.status(404).json({
//                 error: 'No history found',
//                 details: version 
//                     ? `No events found for version ${version}`
//                     : rule_id 
//                         ? `No events found for rule ${rule_id}`
//                         : 'No events found for the specified criteria'
//             });
//         }

//         // Format the response
//         const response = {
//             total_events: historyResult.rows.length,
//             history: historyResult.rows.map(event => ({
//                 event_id: event.id,
//                 event_type: event.event_type,
//                 rule_id: event.aggregate_id,
//                 rule_name: event.rule_name,
//                 rule_group_name: event.rule_group_name,
//                 version: event.version,
//                 sequence_number: event.sequence_number,
//                 event_data: event.event_data,
//                 metadata: event.metadata,
//                 created_at: event.created_at
//             }))
//         };

//         // Add filters used to response
//         if (rule_id) response.rule_id = rule_id;
//         if (rule_group_id) response.rule_group_id = rule_group_id;
//         if (version) response.version = version;

//         return res.json(response);

//     } catch (err) {
//         console.error('Error fetching history:', err);
//         return res.status(500).json({ 
//             error: 'Internal server error',
//             details: err.message
//         });
//     }
// };




// exports.viewHistory = async (req, res) => {
//     const rule_id = req.params.rule_id ? parseInt(req.params.rule_id, 10) : undefined;
//     const rule_group_id = req.params.rule_group_id ? parseInt(req.params.rule_group_id, 10) : undefined;
//     const version = req.params.version ? parseInt(req.params.version, 10) : undefined;
  
//     try {
//       // If version is specified, fetch rule info from rules table
//       if (version) {
//         const result = await db.query(
//           `SELECT 
//               r.*,
//               rg.name as rule_group_name,
//               rg.execution_type as rule_group_execution_type
//             FROM rules r
//             JOIN rule_groups rg ON r.rule_group_id = rg.id
//             WHERE r.id = $1 
//               AND r.rule_group_id = $2
//               AND r.version = $3
//               AND r.is_active = true`,
//           [rule_id, rule_group_id, version]
//         );
  
//         if (result.rows.length === 0) {
//           return res.status(404).json({
//             error: 'Version not found',
//             details: `Version ${version} not found for rule ${rule_id}`,
//           });
//         }
  
//         const rule = result.rows[0];
//         return res.json({
//           rule_id: rule.id,
//           rule_group_id: rule.rule_group_id,
//           name: rule.name,
//           description: rule.description,
//           json_rule: rule.json_rule,
//           version: rule.version,
//           is_active: rule.is_active,
//           is_latest: rule.is_latest,
//           created_at: rule.created_at,
//           updated_at: rule.updated_at,
//           rule_group_name: rule.rule_group_name,
//           execution_type: rule.rule_group_execution_type,
//         });
//       }
  
//       // Otherwise, fetch event history from rule_events table
//       // To support fetching history across versions, fetch rule name and group if rule_id is provided
//       let ruleName = null;
//       let groupId = rule_group_id;
  
//       if (rule_id) {
//         const ruleRes = await db.query(
//           `SELECT name, rule_group_id FROM rules WHERE id = $1`,
//           [rule_id]
//         );
//         if (ruleRes.rows.length === 0) {
//           return res.status(404).json({ error: "Rule not found" });
//         }
//         ruleName = ruleRes.rows[0].name;
//         groupId = ruleRes.rows[0].rule_group_id;
//       }
  
//       let query = `
//         SELECT re.*,
//                r.name as rule_name,
//                r.version,
//                rg.name as rule_group_name
//         FROM rule_events re
//         JOIN rules r ON re.aggregate_id = r.id
//         JOIN rule_groups rg ON r.rule_group_id = rg.id
//         WHERE 1=1
//       `;
//       const queryParams = [];
//       let paramCount = 1;
  
//       if (groupId) {
//         query += ` AND r.rule_group_id = $${paramCount}`;
//         queryParams.push(groupId);
//         paramCount++;
//       }
  
//       if (ruleName) {
//         query += ` AND r.name = $${paramCount}`;
//         queryParams.push(ruleName);
//         paramCount++;
//       }
  
//       if (version && !isNaN(version)) {
//         query += ` AND r.version = $${paramCount}`;
//         queryParams.push(version);
//         paramCount++;
//       }
  
//       query += ` ORDER BY re.created_at DESC, re.sequence_number DESC`;
  
//       const historyResult = await db.query(query, queryParams);
  
//       if (historyResult.rows.length === 0) {
//         return res.status(404).json({
//           error: 'No history found',
//           details: version
//             ? `No events found for version ${version}`
//             : ruleName
//             ? `No events found for rule '${ruleName}'`
//             : 'No events found for the specified criteria',
//         });
//       }
  
//       // Format the response
//       const response = {
//         total_events: historyResult.rows.length,
//         history: historyResult.rows.map(event => ({
//           event_id: event.id,
//           event_type: event.event_type,
//           rule_id: event.aggregate_id,
//           rule_name: event.rule_name,
//           rule_group_name: event.rule_group_name,
//           version: event.version,
//           sequence_number: event.sequence_number,
//           event_data: event.event_data,
//           metadata: event.metadata,
//           created_at: event.created_at,
//         })),
//       };
  
//       if (rule_id) response.rule_id = rule_id;
//       if (groupId) response.rule_group_id = groupId;
//       if (version) response.version = version;
  
//       return res.json(response);
//     } catch (err) {
//       console.error('Error fetching history:', err);
//       return res.status(500).json({
//         error: 'Internal server error',
//         details: err.message,
//       });
//     }
//   };
  

exports.viewHistory = async (req, res) => {
    const rule_id = req.params.rule_id ? parseInt(req.params.rule_id, 10) : undefined;
    const rule_group_id = req.params.rule_group_id ? parseInt(req.params.rule_group_id, 10) : undefined;
    const version = req.query.version ? parseInt(req.query.version, 10) : undefined; // version is now a query param
  
    try {
      if (!rule_id || !rule_group_id) {
        return res.status(400).json({ error: 'Missing rule_id or rule_group_id' });
      }
  
      // Fetch rule name based on rule_id (to get all versions with the same name)
      const ruleRes = await db.query(
        `SELECT name, rule_group_id FROM rules WHERE id = $1 AND rule_group_id = $2`,
        [rule_id, rule_group_id]
      );
  
      if (ruleRes.rows.length === 0) {
        return res.status(404).json({ error: 'Rule not found' });
      }
  
      const ruleName = ruleRes.rows[0].name;
  
      // Fetch all history for this rule name and group (across all versions)
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
        query += ` AND r.version = $3`;
        queryParams.push(version);
      }
  
      query += ` ORDER BY re.created_at DESC, re.sequence_number DESC`;
  
      const historyResult = await db.query(query, queryParams);
  
      if (historyResult.rows.length === 0) {
        return res.status(404).json({
          error: 'No history found',
          details: version
            ? `No events found for version ${version}`
            : `No events found for rule '${ruleName}' in group ${rule_group_id}`,
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
          created_at: new Date(event.created_at).toISOString(), 
        })),
      };
  
      return res.json(response);
    } catch (err) {
      console.error('Error fetching history:', err);
      return res.status(500).json({
        error: 'Internal server error',
        details: err.message,
      });
    }
  };
  


// exports.evaluateRule = async (req, res) => {
//     console.log('Received request to evaluate rules');
//     const { loanDetails } = req.body;
//     const ruleGroupId = req.ruleGroupId;

//     if (!Array.isArray(loanDetails) || loanDetails.length === 0) {
//         return res.status(400).json({ error: 'loanDetails must be a non-empty array' });
//     }

//     const client = await pool.connect();
//     try {
//         await client.query('BEGIN');

//         // Generate trace_id for this evaluation session
//         const traceIdResult = await client.query("SELECT gen_random_uuid() as trace_id");
//         const trace_id = traceIdResult.rows[0].trace_id;

//         // Fetch all active, latest rules with JSON rules for the group
//         const rulesQuery = `
//             SELECT r.id, r.name, r.json_rule, r.version, rg.execution_type
//             FROM rules r
//             JOIN rule_groups rg ON r.rule_group_id = rg.id
//             WHERE r.is_active = true
//                 AND r.is_latest = true
//                 AND rg.is_active = true
//                 AND r.rule_group_id = $1
//         `;
//         const ruleRes = await client.query(rulesQuery, [ruleGroupId]);
//         if (ruleRes.rowCount === 0) {
//             return res.status(404).json({ error: 'No active rules found for the rule group' });
//         }

//         // Fetch tags and parameters for all rules in this group
//         const ruleIds = ruleRes.rows.map(r => r.id);
//         const tagsRes = await client.query(
//             `SELECT rtm.rule_id, rt.name
//              FROM rule_tags_map rtm
//              JOIN rule_tags rt ON rtm.tag_id = rt.id
//              WHERE rtm.rule_id = ANY($1)`,
//             [ruleIds]
//         );
//         const paramsRes = await client.query(
//             `SELECT rpm.rule_id, rp.name, rp.default_value
//              FROM rule_parameter_map rpm
//              JOIN rule_parameters rp ON rpm.parameter_id = rp.id
//              WHERE rpm.rule_id = ANY($1)`,
//             [ruleIds]
//         );

//         // Build lookup maps for tags and parameters
//         const tagsMap = {};
//         tagsRes.rows.forEach(row => {
//             if (!tagsMap[row.rule_id]) tagsMap[row.rule_id] = [];
//             tagsMap[row.rule_id].push(row.name);
//         });
//         const paramsMap = {};
//         paramsRes.rows.forEach(row => {
//             if (!paramsMap[row.rule_id]) paramsMap[row.rule_id] = {};
//             paramsMap[row.rule_id][row.name] = row.default_value;
//         });

//         let rules = ruleRes.rows;
//         // Sort rules by priority ascending (lowest value = highest priority)
//         rules = rules.sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));
//         const executionType = rules[0].execution_type;
//         const results = [];

//         for (const loan of loanDetails) {
//             // Build facts for each rule evaluation
//             let matchedRule = null;
//             let finalResult = false;
//             let matchedEvent = null;
//             let matchedFacts = null; // <-- store facts for matched rule

//             for (const rule of rules) {
//                 const facts = {
//                     ...loan,
//                     tags: tagsMap[rule.id] || [],
//                     parameters: paramsMap[rule.id] || {}
//                 };

//                 // Ensure nested objects exist
//                 if (!facts.loanAdditionalInfos) facts.loanAdditionalInfos = {};
//                 if (!facts.loanProductAdditionalInfo) facts.loanProductAdditionalInfo = {};

//                 // Merge parameter values into nested objects if not present in input (fix: use === undefined)
//                 if (paramsMap[rule.id]) {
//                     if (paramsMap[rule.id].PRE_PAYMENT_ENABLED !== undefined) {
//                         if (facts.loanAdditionalInfos.PRE_PAYMENT_ENABLED === undefined) {
//                             facts.loanAdditionalInfos.PRE_PAYMENT_ENABLED = paramsMap[rule.id].PRE_PAYMENT_ENABLED;
//                         }
//                         if (facts.loanProductAdditionalInfo.PRE_PAYMENT_ENABLED === undefined) {
//                             facts.loanProductAdditionalInfo.PRE_PAYMENT_ENABLED = paramsMap[rule.id].PRE_PAYMENT_ENABLED;
//                         }
//                     }
//                 }

//                 try {
//                     const engine = new Engine();
//                     engine.addRule(typeof rule.json_rule === 'string' ? JSON.parse(rule.json_rule) : rule.json_rule);
//                     const { events } = await engine.run(facts);

//                     // Log each rule evaluation
//                     await client.query(
//                         `INSERT INTO rule_evaluation_logs (
//                             rule_id, rule_group_id, input_payload, result, evaluated_by,
//                             trace_id, version, created_by, updated_by, created_by_tool, 
//                             updated_by_tool, action_type, action_value
//                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'system', 'system', $9, $10)`,
//                         [
//                             rule.id,
//                             ruleGroupId,
//                             JSON.stringify(facts),
//                             events.length > 0,
//                             'system',
//                             trace_id,
//                             rule.version,
//                             0,
//                             events.length > 0 ? events[0].type : null,
//                             events.length > 0 ? JSON.stringify(events[0].params) : null
//                         ]
//                     );

//                     console.log('Evaluating rule:', rule.name, JSON.stringify(rule.json_rule, null, 2));
//                     console.log('With facts:', JSON.stringify(facts, null, 2));

//                     if (events.length > 0) {
//                         matchedRule = rule;
//                         matchedEvent = events[0];
//                         finalResult = true;
//                         matchedFacts = facts; // <-- save facts for this match
//                         break; // Stop at the first (highest priority) match
//                     }
//                 } catch (err) {
//                     // Log error and skip this rule, do not push a result
//                     console.error(`Error evaluating rule [${rule.name}]:`, err.message);
//                     continue;
//                 }
//             }

//             if (finalResult && matchedRule && matchedEvent) {
//                 // --- Dynamic event param substitution ---
//                 const event = { ...matchedEvent };
//                 if (
//                   event.params &&
//                   event.params.razorpayMid === "LENDER_ID_DYNAMIC" &&
//                   matchedFacts &&
//                   matchedFacts.lenderId
//                 ) {
//                   event.params.razorpayMid = matchedFacts.lenderId;
//                 }
//                 results.push({
//                     result: true,
//                     rule: matchedRule.name,
//                     event,
//                     trace_id
//                 });
//             } else {
//                 results.push({ 
//                     result: false,
//                     trace_id
//                 });
//             }
//         }

//         await client.query('COMMIT');
//         return res.status(200).json({ evaluations: results });

//     } catch (err) {
//         await client.query('ROLLBACK');
//         console.error('Evaluation error:', err);
//         return res.status(500).json({ error: 'Internal server error' });
//     } finally {
//         client.release();
//     }
// };



exports.evaluateRule = async (req, res) => {
    console.log('Received request to evaluate rules');
    const { loanDetails } = req.body;
    const ruleGroupId = req.ruleGroupId;

    if (!Array.isArray(loanDetails) || loanDetails.length === 0) {
        return res.status(400).json({ error: 'loanDetails must be a non-empty array' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const traceIdResult = await client.query("SELECT gen_random_uuid() as trace_id");
        const trace_id = traceIdResult.rows[0].trace_id;

        const rulesQuery = `
            SELECT r.id, r.name, r.json_rule, r.version, r.priority, rg.execution_type
            FROM rules r
            JOIN rule_groups rg ON r.rule_group_id = rg.id
            WHERE r.is_active = true
              AND r.is_latest = true
              AND rg.is_active = true
              AND r.rule_group_id = $1
        `;
        const ruleRes = await client.query(rulesQuery, [ruleGroupId]);
        if (ruleRes.rowCount === 0) {
            return res.status(404).json({ error: 'No active rules found for the rule group' });
        }

        const ruleIds = ruleRes.rows.map(r => r.id);
        const tagsRes = await client.query(
            `SELECT rtm.rule_id, rt.name
             FROM rule_tags_map rtm
             JOIN rule_tags rt ON rtm.tag_id = rt.id
             WHERE rtm.rule_id = ANY($1)`,
            [ruleIds]
        );
        const paramsRes = await client.query(
            `SELECT rpm.rule_id, rp.name, rp.default_value
             FROM rule_parameter_map rpm
             JOIN rule_parameters rp ON rpm.parameter_id = rp.id
             WHERE rpm.rule_id = ANY($1)`,
            [ruleIds]
        );

        const tagsMap = {};
        tagsRes.rows.forEach(row => {
            if (!tagsMap[row.rule_id]) tagsMap[row.rule_id] = [];
            tagsMap[row.rule_id].push(row.name);
        });

        const paramsMap = {};
        paramsRes.rows.forEach(row => {
            if (!paramsMap[row.rule_id]) paramsMap[row.rule_id] = {};
            paramsMap[row.rule_id][row.name] = row.default_value;
        });

        let rules = ruleRes.rows;
        rules = rules.sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));
        const executionType = rules[0].execution_type;
        const results = [];

        for (const loan of loanDetails) {
            let matchedRule = null;
            let finalResult = false;
            let matchedEvent = null;
            let matchedFacts = null;

            for (const rule of rules) {
                const facts = {
                    ...loan,
                    tags: tagsMap[rule.id] || [],
                    parameters: paramsMap[rule.id] || {}
                };

                if (!facts.loanAdditionalInfos) facts.loanAdditionalInfos = {};
                if (!facts.loanProductAdditionalInfo) facts.loanProductAdditionalInfo = {};

                if (paramsMap[rule.id]) {
                    if (paramsMap[rule.id].PRE_PAYMENT_ENABLED !== undefined) {
                        if (facts.loanAdditionalInfos.PRE_PAYMENT_ENABLED === undefined) {
                            facts.loanAdditionalInfos.PRE_PAYMENT_ENABLED = paramsMap[rule.id].PRE_PAYMENT_ENABLED;
                        }
                        if (facts.loanProductAdditionalInfo.PRE_PAYMENT_ENABLED === undefined) {
                            facts.loanProductAdditionalInfo.PRE_PAYMENT_ENABLED = paramsMap[rule.id].PRE_PAYMENT_ENABLED;
                        }
                    }
                }

                try {
                    const engine = new Engine();
                    engine.addRule(typeof rule.json_rule === 'string' ? JSON.parse(rule.json_rule) : rule.json_rule);
                    const { events } = await engine.run(facts);

                    await client.query(
                        `INSERT INTO rule_evaluation_logs (
                            rule_id, rule_group_id, input_payload, result, evaluated_by,
                            trace_id, version, created_by, updated_by, created_by_tool, 
                            updated_by_tool, action_type, action_value
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'system', 'system', $9, $10)`,
                        [
                            rule.id,
                            ruleGroupId,
                            JSON.stringify(facts),
                            events.length > 0,
                            'system',
                            trace_id,
                            rule.version,
                            0,
                            events.length > 0 ? events[0].type : null,
                            events.length > 0 ? JSON.stringify(events[0].params) : null
                        ]
                    );

                    console.log('Evaluating rule:', rule.name, JSON.stringify(rule.json_rule, null, 2));
                    console.log('With facts:', JSON.stringify(facts, null, 2));

                    if (events.length > 0) {
                        matchedRule = rule;
                        matchedEvent = events[0];
                        finalResult = true;
                        matchedFacts = facts;
                        break; // stop at first match if FIRST_MATCH
                    }
                } catch (err) {
                    console.error(`Error evaluating rule [${rule.name}]:`, err.message);
                    continue;
                }
            }

            if (finalResult && matchedRule && matchedEvent) {
                const event = { ...matchedEvent };
                if (
                  event.params &&
                  event.params.razorpayMid === "LENDER_ID_DYNAMIC" &&
                  matchedFacts &&
                  matchedFacts.lenderId
                ) {
                  event.params.razorpayMid = matchedFacts.lenderId;
                }

                results.push({
                    result: true,
                    rule: matchedRule.name,
                    event,
                    trace_id,
                    json_rule: matchedRule.json_rule,
                    action_value: event.params || {}
                });
            } else {
                // Add alert message for failed evaluation
                results.push({ 
                    result: false,
                    trace_id,
                    alert: true,
                    message: "No rule matched for the provided input. Please review the input or rules."
                });
            }
        }

        await client.query('COMMIT');
        return res.status(200).json({ evaluations: results });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Evaluation error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};

// Register dynamic facts for the engine
function registerDynamicFacts(engine) {
    // Example: loanAdditionalInfos
    engine.addFact('loanAdditionalInfos', async (params, almanac) => {
        // In production, fetch from DB or API
        // For demo, use static
        return { PRE_PAYMENT_ENABLED: "false" };
    });
    engine.addFact('loanProductAdditionalInfo', async (params, almanac) => {
        return { PRE_PAYMENT_ENABLED: "true" };
    });
    engine.addFact('env', async (params, almanac) => {
        return "qa";
    });
    engine.addFact('lenderId', async (params, almanac) => {
        return "3";
    });
    // Add more dynamic facts as needed
}

exports.evaluateRuleWithDynamicFacts = async (req, res) => {
    try {
        const { rules, facts } = req.body;
        if (!rules || !Array.isArray(rules) || rules.length === 0) {
            return res.status(400).json({ error: 'Rules array is required.' });
        }
        // Setup engine
        const engine = new Engine();
        registerDynamicFacts(engine);
        // Add rules
        for (const rule of rules) {
            engine.addRule(rule);
        }
        // Run engine
        const { events } = await engine.run(facts || {});
        return res.json({ events });
    } catch (error) {
        console.error('Error evaluating rules with dynamic facts:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};
/**
 * @swagger
 * /rule-engine/api/v1/groups/{rule_group_id}/rules:
 *   get:
 *     summary: Get rules with optional filtering
 *     tags: [Rules]
 *     parameters:
 *       - in: path
 *         name: rule_group_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: version
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of rules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page: 
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 rules:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Rule'
 */

// /**
//  * @param {import('express').Request} req
//  * @param {import('express').Response} res
//  * @returns {Promise<void>}
//  */
// exports.getRules = async (req, res) => {
//     const { rule_group_id } = req.params;
//     console.log(`GET /rule-engine/api/v1/groups/${rule_group_id}/rules - Request received`);
//     const { 
//         page = 1, 
//         limit = 10, 
//         search = "",
//         version 
//     } = req.query;

//     if (!rule_group_id) {
//         return res.status(400).json({ error: 'Missing rule_group_id' });
//     }

//     if (isNaN(page) || isNaN(limit) || page <= 0 || limit <= 0) {
//         return res.status(400).json({ error: 'Invalid page or limit parameter' });
//     }

//     try {
//         const offset = (page - 1) * limit;
//         let queryParams = [rule_group_id, `%${search}%`, limit, offset];
        
//         let query = `
//             WITH base_rules AS (
//                 SELECT 
//                     r.id           AS rule_id,
//                     r.name         AS rule_name,
//                     r.description  AS rule_description,
//                     r.json_rule,
//                     r.version,
//                     r.is_active,
//                     r.is_latest,
//                     r.created_by,
//                     r.updated_by,
//                     r.created_by_tool,
//                     r.updated_by_tool,
//                     r.created_at,
//                     r.updated_at,
//                     rg.name        AS rule_group_name,
//                     rg.execution_type AS rule_group_execution_type
//                 FROM rules r
//                 JOIN rule_groups rg ON r.rule_group_id = rg.id
//                 WHERE r.rule_group_id = $1
//                     AND r.is_active = TRUE
//                     AND r.name ILIKE $2
//                     ${version ? '' : 'AND r.is_latest = TRUE'}
//                     ${version ? 'AND r.version = $5' : ''}
//             ),
//             parameters AS (
//                 SELECT 
//                     rpm.rule_id,
//                     json_agg(json_build_object(
//                         'id', rp.id,
//                         'name', rp.name,
//                         'data_type', rp.data_type,
//                         'description', rp.description,
//                         'is_required', rp.is_required,
//                         'default_value', rp.default_value
//                     )) AS params
//                 FROM rule_parameter_map rpm
//                 JOIN rule_parameters rp ON rpm.parameter_id = rp.id
//                 WHERE rpm.rule_id = ANY((SELECT rule_id FROM base_rules))
//                 GROUP BY rpm.rule_id
//             ),
//             tags AS (
//                 SELECT
//                     rtm.rule_id,
//                     json_agg(json_build_object(
//                         'name', rt.name,
//                         'description', rt.description
//                     )) AS tags
//                 FROM rule_tags_map rtm
//                 JOIN rule_tags rt ON rtm.tag_id = rt.id
//                 WHERE rtm.rule_id = ANY((SELECT rule_id FROM base_rules))
//                 GROUP BY rtm.rule_id
//             )
//             SELECT
//                 br.*,
//                 COALESCE(p.params, '[]') AS parameters,
//                 COALESCE(t.tags, '[]') AS tags
//             FROM base_rules br
//             LEFT JOIN parameters p ON br.rule_id = p.rule_id
//             LEFT JOIN tags t ON br.rule_id = t.rule_id
//             ORDER BY br.created_at DESC
//             LIMIT $3 OFFSET $4`;

//         // Add version parameter if specified
//         if (version) {
//             queryParams.push(parseInt(version));
//         }

//         const result = await db.query(query, queryParams);

//         const rules = result.rows.map(rule => ({
//             id: rule.rule_id,
//             name: rule.rule_name,
//             description: rule.rule_description,
//             json_rule: rule.json_rule,
//             version: rule.version,
//             is_active: rule.is_active,
//             is_latest: rule.is_latest,
//             created_by: rule.created_by,
//             updated_by: rule.updated_by,
//             created_by_tool: rule.created_by_tool,
//             updated_by_tool: rule.updated_by_tool,
//             created_at: rule.created_at,
//             updated_at: rule.updated_at,
//             rule_group: {
//                 name: rule.rule_group_name,
//                 execution_type: rule.rule_group_execution_type,
//             },
//             parameters: rule.parameters,
//             tags: rule.tags,
//         }));

//         if (rules.length === 0) {
//             return res.status(404).json({ 
//                 error: 'No rules found',
//                 details: version 
//                     ? `No rules found for version ${version} in group ${rule_group_id}`
//                     : `No rules found in group ${rule_group_id}`
//             });
//         }

//         return res.status(200).json({
//             page,
//             limit,
//             total: result.rowCount,
//             version: version || 'all',
//             rules
//         });

//     } catch (err) {
//         console.error('Error fetching rules:', err);
//         return res.status(500).json({ 
//             error: 'Internal server error',
//             details: err.message
//         });
//     }
// };
/**
 * Fetch rules with optional filtering.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.getRules = async (req, res) => {
    const { rule_group_id } = req.params;
    const { page = 1, limit = 10, search = "", version } = req.query;

    // Validate required parameters
    if (!rule_group_id) {
        return res.status(400).json({ error: 'Missing rule_group_id' });
    }

    if (isNaN(page) || isNaN(limit) || page <= 0 || limit <= 0) {
        return res.status(400).json({ error: 'Invalid page or limit parameter' });
    }

    try {
        const offset = (page - 1) * limit;
        const queryParams = [rule_group_id, `%${search}%`, limit, offset];

        let query = `
            WITH base_rules AS (
                SELECT 
                    r.id           AS rule_id,
                    r.name         AS rule_name,
                    r.description  AS rule_description,
                    r.json_rule,
                    r.version,
                    r.is_active,
                    r.is_latest,
                    r.created_by,
                    r.updated_by,
                    r.created_by_tool,
                    r.updated_by_tool,
                    r.created_at,
                    r.updated_at,
                    rg.name        AS rule_group_name,
                    rg.execution_type AS rule_group_execution_type
                FROM rules r
                JOIN rule_groups rg ON r.rule_group_id = rg.id
                WHERE r.rule_group_id = $1
                    AND r.is_active = TRUE
                    AND r.name ILIKE $2
                    ${version ? '' : 'AND r.is_latest = TRUE'}
                    ${version ? 'AND r.version = $5' : ''}
            ),
            parameters AS (
                SELECT 
                    rpm.rule_id,
                    json_agg(json_build_object(
                        'id', rp.id,
                        'name', rp.name,
                        'data_type', rp.data_type,
                        'description', rp.description,
                        'is_required', rp.is_required,
                        'default_value', rp.default_value
                    )) AS params
                FROM rule_parameter_map rpm
                JOIN rule_parameters rp ON rpm.parameter_id = rp.id
                WHERE rpm.rule_id = ANY((SELECT rule_id FROM base_rules))
                GROUP BY rpm.rule_id
            ),
            tags AS (
                SELECT
                    rtm.rule_id,
                    json_agg(json_build_object(
                        'name', rt.name,
                        'description', rt.description
                    )) AS tags
                FROM rule_tags_map rtm
                JOIN rule_tags rt ON rtm.tag_id = rt.id
                WHERE rtm.rule_id = ANY((SELECT rule_id FROM base_rules))
                GROUP BY rtm.rule_id
            )
            SELECT
                br.*,
                COALESCE(p.params, '[]') AS parameters,
                COALESCE(t.tags, '[]') AS tags
            FROM base_rules br
            LEFT JOIN parameters p ON br.rule_id = p.rule_id
            LEFT JOIN tags t ON br.rule_id = t.rule_id
            ORDER BY br.created_at DESC
            LIMIT $3 OFFSET $4`;

        // Add version parameter if specified
        if (version) {
            queryParams.push(parseInt(version, 10));
        }

        const result = await db.query(query, queryParams);

        // Map the results to a structured response
        const rules = result.rows.map(rule => ({
            id: rule.rule_id,
            name: rule.rule_name,
            description: rule.rule_description,
            json_rule: rule.json_rule,
            version: rule.version,
            is_active: rule.is_active,
            is_latest: rule.is_latest,
            created_by: rule.created_by,
            updated_by: rule.updated_by,
            created_by_tool: rule.created_by_tool,
            updated_by_tool: rule.updated_by_tool,
            created_at: rule.created_at,
            updated_at: rule.updated_at,
            rule_group: {
                name: rule.rule_group_name,
                execution_type: rule.rule_group_execution_type,
            },
            parameters: rule.parameters,
            tags: rule.tags,
        }));

        if (rules.length === 0) {
            return res.status(404).json({
                error: 'No rules found',
                details: version
                    ? `No rules found for version ${version} in group ${rule_group_id}`
                    : `No rules found in group ${rule_group_id}`
            });
        }

        return res.status(200).json({
            page: Number(page),
            limit: Number(limit),
            total: result.rowCount,
            version: version || 'all',
            rules
        });

    } catch (err) {
        console.error('Error fetching rules:', err);
        return res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
};
/**
 * @swagger
 * /rule-engine/api/v1/groups/{rule_group_id}/rules/{rule_id}/version/{version}:
 *   get:
 *     summary: Get specific version of a rule
 *     tags: [Rules]
 *     parameters:
 *       - in: path
 *         name: rule_group_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: rule_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: version
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Rule details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Rule'
 */
exports.getRuleByVersion = async (req, res) => {
    const { rule_group_id, rule_id, version } = req.params;
    
    try {
        const result = await db.query(
            `WITH base_rule AS (
                SELECT 
                    r.id           AS rule_id,
                    r.name         AS rule_name,
                    r.description  AS rule_description,
                    r.json_rule,
                    r.version,
                    r.is_active,
                    r.is_latest,
                    r.created_by,
                    r.updated_by,
                    r.created_by_tool,
                    r.updated_by_tool,
                    r.created_at,
                    r.updated_at,
                    rg.name        AS rule_group_name,
                    rg.execution_type AS rule_group_execution_type
                FROM rules r
                JOIN rule_groups rg ON r.rule_group_id = rg.id
                WHERE r.rule_group_id = $1
                    AND r.id = $2
                    AND r.version = $3
                    AND r.is_active = TRUE
            ),
            parameters AS (
                SELECT 
                    rpm.rule_id,
                    json_agg(json_build_object(
                        'id', rp.id,
                        'name', rp.name,
                        'data_type', rp.data_type,
                        'description', rp.description,
                        'is_required', rp.is_required,
                        'default_value', rp.default_value
                    )) AS params
                FROM rule_parameter_map rpm
                JOIN rule_parameters rp ON rpm.parameter_id = rp.id
                WHERE rpm.rule_id = (SELECT rule_id FROM base_rule)
                GROUP BY rpm.rule_id
            ),
            tags AS (
                SELECT
                    rtm.rule_id,
                    json_agg(json_build_object(
                        'name', rt.name,
                        'description', rt.description
                    )) AS tags
                FROM rule_tags_map rtm
                JOIN rule_tags rt ON rtm.tag_id = rt.id
                WHERE rtm.rule_id = (SELECT rule_id FROM base_rule)
                GROUP BY rtm.rule_id
            )
            SELECT
                br.*,
                COALESCE(p.params, '[]') AS parameters,
                COALESCE(t.tags, '[]') AS tags
            FROM base_rule br
            LEFT JOIN parameters p ON br.rule_id = p.rule_id
            LEFT JOIN tags t ON br.rule_id = t.rule_id`,
            [rule_group_id, rule_id, version]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Rule version not found',
                details: `Version ${version} not found for rule ${rule_id} in group ${rule_group_id}`
            });
        }

        const rule = result.rows[0];
        return res.status(200).json({
            id: rule.rule_id,
            name: rule.rule_name,
            description: rule.rule_description,
            json_rule: rule.json_rule,
            version: rule.version,
            is_active: rule.is_active,
            is_latest: rule.is_latest,
            created_by: rule.created_by,
            updated_by: rule.updated_by,
            created_by_tool: rule.created_by_tool,
            updated_by_tool: rule.updated_by_tool,
            created_at: rule.created_at,
            updated_at: rule.updated_at,
            rule_group: {
                name: rule.rule_group_name,
                execution_type: rule.rule_group_execution_type,
            },
            parameters: rule.parameters,
            tags: rule.tags
        });

    } catch (err) {
        console.error('Error fetching rule version:', err);
        return res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
};


exports.toggleRule = async (req, res) => {
  const { rule_id, enabled } = req.params;
  const selectedWorkspace = req.selectedWorkspace;
  const groupNames = req.groupNames;

  if (enabled !== 'true' && enabled !== 'false') {
    return res.status(400).json({ error: "'enabled' must be 'true' or 'false'" });
  }

  const isEnabled = enabled === 'true';

  try {
    // Fetch the latest active rule for this rule_id
    const ruleQuery = `SELECT * FROM rules WHERE rule_id = $1 AND is_active = true`;
    const ruleResult = await db.query(ruleQuery, [rule_id]);

    if (ruleResult.rows.length === 0)   {
      return res.status(404).json({ error: 'Active rule not found for given rule_id' });
    }

    const rule = ruleResult.rows[0];

    // Validate workspace scope
    if (!groupNames.includes(rule.group_name)) {
      return res.status(403).json({
        error: `Rule does not belong to workspace "${selectedWorkspace}"`,
      });
    }

    // Update enabled flag
    await db.query(`UPDATE rules SET enabled = $1 WHERE id = $2`, [isEnabled, rule.id]);

    // Log event
    await db.query(
      `INSERT INTO rule_events (rule_id, event_type, payload, created_at)
       VALUES ($1, 'TOGGLE', $2, NOW())`,
      [rule_id, rule]
    );

    res.json({
      message: `Rule (version ${rule.version}) ${isEnabled ? 'enabled' : 'disabled'} successfully`,
      rule_id,
      version: rule.version,
    });

  } catch (err) {
    console.error('Error toggling rule:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


exports.getRuleGroups = async (req, res) => {
    const { page = 1, limit = 10, search = "" } = req.query;

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
};

// Demo implementation for fetchFactDataFromSource
async function fetchFactDataFromSource(factName) {
    // In production, fetch from DB or another service
    // For demo, use static objects
    const facts = {
        loanAdditionalInfos: { PRE_PAYMENT_ENABLED: "false" },
        loanProductAdditionalInfo: { PRE_PAYMENT_ENABLED: "true" },
        env: "qa",
        lenderId: "3",
        userProfile: { id: 1, name: "Alice", roles: ["admin"] },
        // Add more facts as needed
    };
    return facts[factName];
}

// Add a new API endpoint to fetch and validate path data
exports.fetchPathData = async (req, res) => {
    const { factName, path } = req.body;

    if (!factName || !path) {
        return res.status(400).json({ error: 'Fact name and path are required.' });
    }

    try {
        // Fetch data from the database or another source
        const factData = await fetchFactDataFromSource(factName); // Now implemented above

        if (!factData) {
            return res.status(404).json({ error: `Fact "${factName}" not found.` });
        }

        // Validate JSONPath format
        if (!path.startsWith('$')) {
            return res.status(400).json({ error: 'Invalid path format. JSONPath must start with "$".' });
        }

        // Use JSONPath to extract the value
        const jsonpath = require('jsonpath');
        const result = jsonpath.query(factData, path);

        if (result.length === 0) {
            return res.status(404).json({ error: `Path "${path}" not found in fact "${factName}".` });
        }

        return res.json({ data: result });
    } catch (error) {
        console.error('Error fetching path data:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Get all unique fact names (parameter names) for a rule group
exports.getFactNamesForGroup = async (req, res) => {
    const { rule_group_id } = req.params;
    try {
        // Fetch all rules for this group
        const rulesResult = await db.query(
            "SELECT json_rule FROM rules WHERE rule_group_id = $1 AND is_active = TRUE",
            [rule_group_id]
        );
        const factNamesSet = new Set();
        for (const row of rulesResult.rows) {
            let jsonRule = row.json_rule;
            if (typeof jsonRule === "string") {
                try { jsonRule = JSON.parse(jsonRule); } catch {}
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
};



