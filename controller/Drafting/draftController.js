const db = require('../../db');
const pool = require('../../db');

exports.saveDraftRule = async (req, res) => {
    let client;
    try {
        const { rule_group_id } = req.params;
        const { draft_id, name, description, json_rule, parameters, tags } = req.body;

        if (!name || !json_rule) {
            return res.status(400).json({ message: 'Name and JSON rule are required.' });
        }

        if (req.user.role !== 'maker') {
            return res.status(403).json({ message: 'Only Makers can save drafts.' });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        let draftIdToUse = draft_id;

        if (draftIdToUse) {
            // Update existing draft
            const updateDraftQuery = `
                UPDATE rule_drafts
                SET rule_group_id = $1,
                    name = $2,
                    description = $3,
                    json_rule = $4,
                    submission_status = 'drafted',
                    updated_by = $5,
                    updated_at = NOW()
                WHERE id = $6
                RETURNING id
            `;
            const updateDraftValues = [
                rule_group_id,
                name,
                description || null,
                JSON.stringify(json_rule),
                req.user.username,
                draftIdToUse,
            ];
            const updateResult = await client.query(updateDraftQuery, updateDraftValues);
            if (updateResult.rowCount === 0) {
                throw new Error('Draft not found for update');
            }

            // Clean old parameter and tag mappings for draft
            await client.query('DELETE FROM rule_parameter_draft_map WHERE rule_draft_id = $1', [draftIdToUse]);
            await client.query('DELETE FROM rule_tag_draft_map WHERE rule_draft_id = $1', [draftIdToUse]);
        } else {
            // Insert new draft
            const insertDraftQuery = `
                INSERT INTO rule_drafts
                (rule_group_id, name, description, json_rule, submission_status, created_by, updated_by, created_at, updated_at)
                VALUES ($1, $2, $3, $4, 'drafted', $5, $5, NOW(), NOW())
                RETURNING id
            `;
            const insertDraftValues = [
                rule_group_id,
                name,
                description || null,
                JSON.stringify(json_rule),
                req.user.username,
            ];
            const insertResult = await client.query(insertDraftQuery, insertDraftValues);
            draftIdToUse = insertResult.rows[0].id;
        }

        // Insert parameters and mapping
        if (parameters && parameters.length > 0) {
            const dataTypeMapping = {
                STRING: 'STRING',
                NUMBER: 'INT',
                FLOAT: 'FLOAT',
                BOOLEAN: 'BOOLEAN',
                DATE: 'DATE'
            };

            for (const param of parameters) {
                const dbDataType = dataTypeMapping[param.data_type];
                if (!dbDataType) {
                    throw new Error(`Invalid data_type: ${param.data_type}. Valid values are: ${Object.keys(dataTypeMapping).join(', ')}`);
                }

                // Upsert parameter draft (unique on name)
                const paramDraftQuery = `
                    INSERT INTO rule_parameters_draft
                    (name, data_type, description, is_required, default_value, created_by, updated_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $6, NOW(), NOW())
                    ON CONFLICT (name) DO UPDATE SET
                        data_type = EXCLUDED.data_type,
                        description = EXCLUDED.description,
                        is_required = EXCLUDED.is_required,
                        default_value = EXCLUDED.default_value,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = NOW()
                    RETURNING id
                `;
                const paramDraftValues = [
                    param.name,
                    dbDataType,
                    param.description || '',
                    param.is_required || false,
                    param.default_value || null,
                    req.user.username,
                ];
                const paramDraftResult = await client.query(paramDraftQuery, paramDraftValues);
                const paramDraftId = paramDraftResult.rows[0].id;

                // Map param draft to rule draft
                const paramMapDraftQuery = `
                    INSERT INTO rule_parameter_draft_map
                    (rule_draft_id, parameter_draft_id, created_by, updated_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $3, NOW(), NOW())
                    ON CONFLICT DO NOTHING
                `;
                await client.query(paramMapDraftQuery, [draftIdToUse, paramDraftId, req.user.username]);
            }
        }

        // Insert tags and mapping
        if (tags && tags.length > 0) {
            for (const tag of tags) {
                // Upsert tag draft (unique on name)
                const tagDraftQuery = `
                    INSERT INTO rule_tags_draft
                    (name, description, created_by, updated_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $3, NOW(), NOW())
                    ON CONFLICT (name) DO UPDATE SET
                        description = EXCLUDED.description,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = NOW()
                    RETURNING id
                `;
                const tagDraftValues = [
                    tag.name,
                    tag.description || '',
                    req.user.username,
                ];
                const tagDraftResult = await client.query(tagDraftQuery, tagDraftValues);
                const tagDraftId = tagDraftResult.rows[0].id;

                // Map tag draft to rule draft
                const tagMapDraftQuery = `
                    INSERT INTO rule_tag_draft_map
                    (rule_draft_id, tag_draft_id, created_by, updated_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $3, NOW(), NOW())
                    ON CONFLICT DO NOTHING
                `;
                await client.query(tagMapDraftQuery, [draftIdToUse, tagDraftId, req.user.username]);
            }
        }

        await client.query('COMMIT');

        return res.status(200).json({ message: 'Draft saved successfully.', draft_id: draftIdToUse });
    } catch (error) {
        console.error('Error saving draft:', error);
        if (client) await client.query('ROLLBACK');
        return res.status(500).json({ message: 'Internal server error.', details: error.message });
    } finally {
        if (client) client.release();
    }
};

exports.createRule = async (req, res) => {
    let client;
    try {
        const { draft_id } = req.body;

        if (!draft_id) {
            return res.status(400).json({ message: 'Draft ID is required to submit the rule.' });
        }

        if (req.user.role !== 'maker') {
            return res.status(403).json({ message: 'Only Makers can submit rules.' });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        // Fetch the draft rule and related info
        const draftQuery = `
            SELECT * FROM rule_drafts WHERE id = $1 AND submission_status = 'drafted'
        `;
        const draftResult = await client.query(draftQuery, [draft_id]);

        if (draftResult.rowCount === 0) {
            throw new Error('Draft not found or already submitted.');
        }

        const draftRule = draftResult.rows[0];

        // Insert into final rules table
        const insertRuleQuery = `
            INSERT INTO rules
            (rule_group_id, name, description, json_rule, status, created_by, updated_by, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'PENDING', $5, $5, NOW(), NOW())
            RETURNING id
        `;
        const insertRuleValues = [
            draftRule.rule_group_id,
            draftRule.name,
            draftRule.description,
            draftRule.json_rule,
            req.user.username,
        ];
        const ruleInsertResult = await client.query(insertRuleQuery, insertRuleValues);
        const ruleId = ruleInsertResult.rows[0].id;

        // Map parameters from draft to final tables
        // Get param draft ids linked to this draft
        const paramDraftMapQuery = `
            SELECT parameter_draft_id FROM rule_parameter_draft_map WHERE rule_draft_id = $1
        `;
        const paramDraftMapResult = await client.query(paramDraftMapQuery, [draft_id]);

        const dataTypeMapping = {
            STRING: 'STRING',
            NUMBER: 'INT',
            FLOAT: 'FLOAT',
            BOOLEAN: 'BOOLEAN',
            DATE: 'DATE'
        };

        for (const row of paramDraftMapResult.rows) {
            const paramDraftId = row.parameter_draft_id;

            // Fetch param draft details
            const paramDraftQuery = `SELECT * FROM rule_parameters_draft WHERE id = $1`;
            const paramDraftRes = await client.query(paramDraftQuery, [paramDraftId]);
            if (paramDraftRes.rowCount === 0) continue;
            const paramDraft = paramDraftRes.rows[0];

            const dbDataType = dataTypeMapping[paramDraft.data_type];
            if (!dbDataType) {
                throw new Error(`Invalid data_type: ${paramDraft.data_type}`);
            }

            // Insert or update parameter in final table (by name)
            const paramUpsertQuery = `
                INSERT INTO rule_parameters
                (name, data_type, description, is_required, default_value, created_by, updated_by, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $6, NOW(), NOW())
                ON CONFLICT (name) DO UPDATE SET
                    data_type = EXCLUDED.data_type,
                    description = EXCLUDED.description,
                    is_required = EXCLUDED.is_required,
                    default_value = EXCLUDED.default_value,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()
                RETURNING id
            `;
            const paramUpsertValues = [
                paramDraft.name,
                dbDataType,
                paramDraft.description,
                paramDraft.is_required,
                paramDraft.default_value,
                req.user.username,
            ];
            const paramUpsertRes = await client.query(paramUpsertQuery, paramUpsertValues);
            const paramId = paramUpsertRes.rows[0].id;

            // Map param to rule in final map table
            const paramMapQuery = `
                INSERT INTO rule_parameter_map (rule_id, parameter_id, created_by, updated_by, created_at, updated_at)
                VALUES ($1, $2, $3, $3, NOW(), NOW())
                ON CONFLICT DO NOTHING
            `;
            await client.query(paramMapQuery, [ruleId, paramId, req.user.username]);
        }

        // Map tags from draft to final tables
        const tagDraftMapQuery = `
            SELECT tag_draft_id FROM rule_tag_draft_map WHERE rule_draft_id = $1
        `;
        const tagDraftMapResult = await client.query(tagDraftMapQuery, [draft_id]);

        for (const row of tagDraftMapResult.rows) {
            const tagDraftId = row.tag_draft_id;

            // Fetch tag draft details
            const tagDraftQuery = `SELECT * FROM rule_tags_draft WHERE id = $1`;
            const tagDraftRes = await client.query(tagDraftQuery, [tagDraftId]);
            if (tagDraftRes.rowCount === 0) continue;
            const tagDraft = tagDraftRes.rows[0];

            // Insert or update tag in final table (by name)
            const tagUpsertQuery = `
                INSERT INTO rule_tags
                (name, description, created_by, updated_by, created_at, updated_at)
                VALUES ($1, $2, $3, $3, NOW(), NOW())
                ON CONFLICT (name) DO UPDATE SET
                    description = EXCLUDED.description,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()
                RETURNING id
            `;
            const tagUpsertValues = [
                tagDraft.name,
                tagDraft.description,
                req.user.username,
            ];
            const tagUpsertRes = await client.query(tagUpsertQuery, tagUpsertValues);
            const tagId = tagUpsertRes.rows[0].id;

            // Map tag to rule in final map table
            const tagMapQuery = `
                INSERT INTO rule_tags_map (rule_id, tag_id, created_by, updated_by, created_at, updated_at)
                VALUES ($1, $2, $3, $3, NOW(), NOW())
                ON CONFLICT DO NOTHING
            `;
            await client.query(tagMapQuery, [ruleId, tagId, req.user.username]);
        }

        // Update draft status to submitted
        const updateDraftStatusQuery = `
            UPDATE rule_drafts SET submission_status = 'submitted', updated_at = NOW(), updated_by = $2 WHERE id = $1
        `;
        await client.query(updateDraftStatusQuery, [draft_id, req.user.username]);

        await client.query('COMMIT');

        return res.status(201).json({ message: 'Rule submitted successfully and is pending approval.', rule_id: ruleId });

    } catch (error) {
        console.error('Error submitting rule:', error);
        if (client) await client.query('ROLLBACK');
        return res.status(500).json({ message: 'Internal server error.', details: error.message });
    } finally {
        if (client) client.release();
    }
};


