import { Outlet } from 'react-router-dom';
import Layout from './Layout';

export default function LayoutWrapper() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
