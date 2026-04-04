import {
    CommandInteraction,
    Client,
    ApplicationCommandType,
    EmbedBuilder,
    ApplicationCommandOptionType,
} from 'discord.js';
import { floor } from 'lodash';
import { Command } from '../Command';
import * as playerService from '../services/player.service';
import * as enforcementService from '../services/enforcement.service';
import { getRankName } from '../helpers/rank';
import Player from '../models/player.schema';
import { getChannelId } from '../services/system.service';
import { ChannelsType } from '../types/channel';
import { safelyReplyToInteraction } from '../helpers/interactions';
import { formatDuration } from '../helpers/duration';
import { EnforcementStatus } from '../models/enforcement.schema';

export const Lookup: Command = {
    name: 'lookup',
    description: 'Look up a player profile with username, rank, rating, and enforcement history',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            type: ApplicationCommandOptionType.User,
            name: 'user',
            description: 'User to look up',
            required: false,
        },
    ],
    run: async (client: Client, interaction: CommandInteraction) => {
        const { user } = interaction;
        const mention = interaction.options.get('user')?.user;

        const queueChannel = await getChannelId(ChannelsType['bot-commands']);
        if (interaction.channelId !== queueChannel) {
            return safelyReplyToInteraction({
                interaction,
                content: `Keep messages in <#${queueChannel}> channel`,
                ephemeral: true,
            });
        }

        const userToCheck = mention || user;
        const player = await playerService.findOrCreate(userToCheck);

        if (player.name !== userToCheck.username) {
            await Player.updateOne({ discordId: userToCheck.id }, { name: userToCheck.username });
            player.name = userToCheck.username;
        }

        // Get display name
        let displayName = player.name;
        try {
            const guild = interaction.guild;
            if (guild) {
                const member = await guild.members.fetch(userToCheck.id);
                displayName = member.displayName;
            }
        } catch {}

        const { history } = player;
        const isUnranked = history.length < 10;
        const rankName = isUnranked ? 'Unranked' : getRankName(player.rating);
        const playerRating = isUnranked ? 'Play 10 matches to get ranked' : floor(player.rating);

        const historyNoAbandon = history.filter(match => match.result !== 'abandon');

        // Last 10 match IDs
        const last10 = historyNoAbandon.slice(-10).reverse();
        const matchIdList =
            last10.length > 0
                ? last10
                      .map(
                          m =>
                              `#${m.matchNumber} (${m.result}, ${m.change > 0 ? '+' : ''}${Math.round(m.change)})`
                      )
                      .join('\n')
                : 'No matches played';

        const lookupEmbed = new EmbedBuilder()
            .setTitle(`${displayName} (@${player.name}) | \`${player.discordId}\``)
            .setColor('#0099ff')
            .setThumbnail(userToCheck.avatarURL())
            .setTimestamp();

        lookupEmbed.addFields(
            {
                name: 'Rank',
                value: `${rankName}`,
                inline: true,
            },
            {
                name: 'Elo',
                value: `${playerRating}`,
                inline: true,
            },
            {
                name: 'Matches Played',
                value: `${historyNoAbandon.length}`,
                inline: true,
            },
            {
                name: 'Last 10 Games',
                value: matchIdList,
                inline: false,
            }
        );

        // Current suspension status
        const isCurrentlyBanned = player.banEnd && player.banEnd > Date.now();
        if (isCurrentlyBanned) {
            const banTimeRemaining = Math.floor((player.banEnd - Date.now()) / (1000 * 60));
            lookupEmbed.addFields({
                name: '🚫 Current Suspension',
                value: [
                    `**Expires:** <t:${Math.floor(player.banEnd / 1000)}:R>`,
                    `**Time Remaining:** ${formatDuration(banTimeRemaining)}`,
                ].join('\n'),
                inline: false,
            });
        }

        // Enforcement history from centralized collection
        const enforcements = await enforcementService.getEnforcementsForUser(userToCheck.id);

        if (enforcements.length > 0) {
            const enforcementList = enforcements.map(e => {
                const isVoided = e.status === EnforcementStatus.voided;
                const statusIcon = isVoided ? '~~' : '';
                const color = isVoided ? '⚪' : '🔴';
                const typeLabel = e.type === 'mod' ? 'Manual Timeout' : `Auto (${e.type})`;

                let line = `${color} ${statusIcon}**${typeLabel}** — ${formatDuration(e.durationMinutes)}${statusIcon}`;
                line += `\n  Reason: ${e.reason}`;
                if (e.modNotes) line += `\n  Mod Notes: *${e.modNotes}*`;
                if (e.modId)
                    line += `\n  By: <@${e.modId}> — <t:${Math.floor(e.createdAt / 1000)}:f>`;
                if (isVoided) line += `\n  **VOIDED** by <@${e.voidedBy}>: ${e.voidReason}`;
                return line;
            });

            // Split into chunks to respect embed field limits
            const chunkSize = 5;
            for (let i = 0; i < enforcementList.length; i += chunkSize) {
                const chunk = enforcementList.slice(i, i + chunkSize);
                lookupEmbed.addFields({
                    name: i === 0 ? `Enforcements (${enforcements.length} total)` : '\u200b',
                    value: chunk.join('\n\n'),
                    inline: false,
                });
            }
        } else {
            lookupEmbed.addFields({
                name: 'Enforcements',
                value: 'No enforcements recorded',
                inline: false,
            });
        }

        return safelyReplyToInteraction({
            interaction,
            embeds: [lookupEmbed],
            ephemeral: false,
        });
    },
};
