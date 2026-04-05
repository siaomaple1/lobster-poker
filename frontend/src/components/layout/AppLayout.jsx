import { Outlet } from 'react-router-dom';
import Header from './Header.jsx';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-[#111] flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
