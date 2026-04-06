import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export async function getMe() { return (await api.get('/auth/me', { baseURL: '/' })).data; }
export async function logout() { return (await api.post('/auth/logout', null, { baseURL: '/' })).data; }
export async function getAuthProviders() { return (await api.get('/auth/providers', { baseURL: '/' })).data; }
export async function getCoins() { return (await api.get('/coins')).data; }
export async function getApiKeys() { return (await api.get('/api-keys')).data; }
export async function saveApiKey(model, apiKey) {
  return (await api.put(`/api-keys/${model}`, { apiKey })).data;
}
export async function deleteApiKey(model) {
  return (await api.delete(`/api-keys/${model}`)).data;
}
export async function getLeaderboard() { return (await api.get('/leaderboard')).data; }
export async function getLobster() { return (await api.get('/lobster')).data; }
export async function saveLobster(data) { return (await api.post('/lobster', data)).data; }
export async function getRooms() { return (await api.get('/rooms')).data; }
export async function createRoom(name) { return (await api.post('/rooms', { name })).data; }
export async function startGame(roomId, testMode = false) { return (await api.post(`/rooms/${roomId}/start`, { testMode })).data; }
export async function stopGame(roomId) { return (await api.post(`/rooms/${roomId}/stop`)).data; }
export async function placeBet(model, amount, roomId) {
  return (await api.post('/bets', { model, amount, roomId })).data;
}
export async function getMyBets() { return (await api.get('/bets/me')).data; }
export async function getAgentToken() { return (await api.get('/agent-token')).data; }
export async function refreshAgentToken() { return (await api.post('/agent-token/refresh')).data; }
export async function submitBugReport(data) { return (await api.post('/bug-reports', data)).data; }

export default api;
