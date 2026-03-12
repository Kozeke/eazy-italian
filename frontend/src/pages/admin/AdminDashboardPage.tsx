/**
 * AdminDashboardPage.tsx — course-first redirect.
 * No courses → /admin/onboarding
 * Has courses → /admin/courses  (catalog)
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { coursesApi } from '../../services/api';

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  useEffect(() => {
    coursesApi.getDashboardStatistics()
      .then((data: any) => {
        if (data?.courses_count === 0) navigate('/admin/onboarding', { replace: true });
        else navigate('/admin/courses', { replace: true });
      })
      .catch(() => navigate('/admin/courses', { replace: true }));
  }, [navigate]);

  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',minHeight:'60vh',fontFamily:"'Inter',system-ui,sans-serif",color:'#9188C4',gap:12 }}>
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:22,height:22,border:'2.5px solid #E5DEFF',borderTopColor:'#6C35DE',borderRadius:'50%',animation:'sp .8s linear infinite' }} />
      Loading…
    </div>
  );
}
