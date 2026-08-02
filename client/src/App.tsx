import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProductListPage from './pages/ProductListPage';
import AddProductPage from './pages/AddProductPage';
import ProductDetailPage from './pages/ProductDetailPage';
import EditProductPage from './pages/EditProductPage';
import SuppliersPage from './pages/SuppliersPage';
import ScanPage from './pages/ScanPage';
import InvoiceListPage from './pages/InvoiceListPage';
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
            // Declared before the :id route so "new" is never read as an id.
            path: 'products/new',
            element: <AddProductPage />,
          },
          {
            path: 'products/:id',
            element: <ProductDetailPage />,
          },
          {
            path: 'products/:id/edit',
            element: <EditProductPage />,
          },
          {
            path: 'suppliers',
            element: <SuppliersPage />,
          },
          {
            path: 'scan',
            element: <ScanPage />,
          },
          {
            path: 'invoices',
            element: <InvoiceListPage />,
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
      {/* Bottom-centred so a confirmation never covers the heading of the screen
          it is confirming. Both offsets are set: below 600px sonner uses
          mobileOffset and ignores offset entirely, which left toasts sitting on
          top of the bottom navigation bar. */}
      <Toaster
        position="bottom-center"
        offset="88px"
        mobileOffset="88px"
        richColors
      />
    </AuthProvider>
  );
}

export default App;
