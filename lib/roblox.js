const axios = require('axios');

const PRESENCE_MAP = {
  0: '⚫ Offline',
  1: '🟢 Online',
  2: '🎮 In Game',
  3: '🛠️ In Studio'
};

async function getUserByUsername(username) {
  const res = await axios.post('https://users.roblox.com/v1/usernames/users', {
    usernames: [username],
    excludeBannedUsers: false
  });
  const match = res.data.data && res.data.data[0];
  if (!match) return null;
  return match.id;
}

async function getUserInfo(userId) {
  const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
  return res.data;
}

async function getAvatarUrl(userId) {
  try {
    const res = await axios.get('https://thumbnails.roblox.com/v1/users/avatar', {
      params: { userIds: userId, size: '420x420', format: 'Png', isCircular: false }
    });
    const item = res.data.data && res.data.data[0];
    return item ? item.imageUrl : null;
  } catch {
    return null;
  }
}

async function getFriendsCount(userId) {
  try {
    const res = await axios.get(`https://friends.roblox.com/v1/users/${userId}/friends/count`);
    return res.data.count;
  } catch {
    return 'N/A';
  }
}

async function getFollowersCount(userId) {
  try {
    const res = await axios.get(`https://friends.roblox.com/v1/users/${userId}/followers/count`);
    return res.data.count;
  } catch {
    return 'N/A';
  }
}

async function getPresence(userId) {
  const cookie = process.env.ROBLOSECURITY;
  if (!cookie) return null; // requires auth for reliable results
  try {
    const res = await axios.post(
      'https://presence.roblox.com/v1/presence/users',
      { userIds: [userId] },
      { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } }
    );
    const p = res.data.userPresences && res.data.userPresences[0];
    if (!p) return null;
    return {
      label: PRESENCE_MAP[p.userPresenceType] || 'Unknown',
      game: p.lastLocation || null
    };
  } catch {
    return null;
  }
}

async function getBadgeCount(userId) {
  try {
    const res = await axios.get(`https://badges.roblox.com/v1/users/${userId}/badges`, {
      params: { limit: 10, sortOrder: 'Desc' }
    });
    return res.data.data ? res.data.data.length : 0;
  } catch {
    return 'N/A';
  }
}

/**
 * Full lookup: returns a formatted text block + avatar image URL,
 * mirroring the fields used in the Discord embed version of this bot.
 */
async function lookupUser(username) {
  const userId = await getUserByUsername(username);
  if (!userId) return null;

  const [info, avatarUrl, friends, followers, badgeCount, presence] = await Promise.all([
    getUserInfo(userId),
    getAvatarUrl(userId),
    getFriendsCount(userId),
    getFollowersCount(userId),
    getBadgeCount(userId),
    getPresence(userId)
  ]);

  const created = new Date(info.created);
  const createdStr = created.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const presenceLine = presence
    ? `${presence.label}${presence.game ? ` (${presence.game})` : ''}`
    : '⚪ Unknown (no .ROBLOSECURITY cookie set)';

  const text =
    `*🧍 ${info.displayName !== info.name ? `${info.displayName} (@${info.name})` : `@${info.name}`}*\n` +
    `🆔 ID: ${info.id}\n` +
    `📅 Joined: ${createdStr}\n` +
    `👥 Friends: ${friends}\n` +
    `➕ Followers: ${followers}\n` +
    `🏅 Badges (recent): ${badgeCount}\n` +
    `📡 Status: ${presenceLine}\n` +
    `${info.isBanned ? '🚫 Account is TERMINATED\n' : ''}` +
    (info.description ? `📝 Bio: ${info.description.slice(0, 300)}\n` : '') +
    `🔗 https://www.roblox.com/users/${info.id}/profile`;

  return { text, avatarUrl, userId };
}

module.exports = { lookupUser, getUserByUsername, getUserInfo };
