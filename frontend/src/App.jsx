import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore.js';
import { useGameSocket } from './hooks/useSocket.js';
import AppLayout from './components/layout/AppLayout.jsx';
import Arena from './pages/Arena.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const { fetchUser, loading } = useAuthStore();
  useGameSocket();

  useEffect(() => { fetchUser(); }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111]">
        <div className="text-4xl animate-spin">🦞</div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route index element={<Arena />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toast />
    </>
  );
}
