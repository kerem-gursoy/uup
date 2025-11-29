import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProductListPage from './pages/ProductListPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ScanPage from './pages/ScanPage';
import InvoiceUploadPage from './pages/InvoiceUploadPage';
import InvoiceReviewPage from './pages/InvoiceReviewPage';
import SettingsPage from './pages/SettingsPage';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <Layout />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
          {
            path: 'products',
            element: <ProductListPage />,
          },
          {
            path: 'products/:id',
            element: <ProductDetailPage />,
          },
          {
            path: 'scan',
            element: <ScanPage />,
          },
          {
            path: 'invoices/upload',
            element: <InvoiceUploadPage />,
          },
          {
            path: 'invoices/:id/review',
            element: <InvoiceReviewPage />,
          },
          {
            path: 'settings',
            element: <SettingsPage />,
          },
          {
            path: '*',
            element: <Navigate to="/" replace />,
          }
        ],
      },
    ],
  },
]);

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
    </AuthProvider>
  );
}

export default App;
