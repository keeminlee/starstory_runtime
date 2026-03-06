import { GuildMember, PermissionFlagsBits } from "discord.js";

export function isElevated(member: GuildMember | null): boolean {
  if (!member) return false;

  if (member.guild.ownerId === member.id) return true;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  return false;
}