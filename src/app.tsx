import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from '@/components/Layout';
import HomePage from '@/pages/HomePage/HomePage';
import NotFoundPage from '@/pages/NotFoundPage/NotFoundPage';

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <Toaster
        theme="dark"
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: 'rgba(24, 24, 27, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#fafafa',
          },
        }}
      />
    </>
  );
}
