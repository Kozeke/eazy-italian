import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usersApi, authApi } from '../../services/api';
import { toast } from 'react-hot-toast';
import { User, Lock, Mail, User as UserIcon, Save, Eye, EyeOff } from 'lucide-react';
import './AdminSettingsPage.css';

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  
  // Profile form state
  const [profileData, setProfileData] = useState({
    email: '',
    first_name: '',
    last_name: '',
  });

  // Password form state
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileData({
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      });
    }
  }, [user]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const updatedUser = await usersApi.updateProfile({
        email: profileData.email,
        first_name: profileData.first_name,
        last_name: profileData.last_name,
      });
      
      toast.success('Профиль успешно обновлен');
      
      // Update auth context by fetching current user again
      const currentUser = await authApi.getCurrentUser();
      // The auth context should update automatically via the token
      window.location.reload(); // Simple way to refresh user data
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при обновлении профиля');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Новые пароли не совпадают');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('Пароль должен содержать минимум 8 символов');
      return;
    }

    setPasswordLoading(true);
    
    try {
      await usersApi.changePassword(passwordData.oldPassword, passwordData.newPassword);
      toast.success('Пароль успешно изменен');
      setPasswordData({
        oldPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при изменении пароля');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="admin-settings-wrapper">
      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Настройки</h1>
            <p className="page-meta">Управляйте своим профилем и настройками аккаунта</p>
          </div>
        </div>

        <div className="settings-grid">
          {/* Profile Settings Card */}
          <div className="settings-card">
            <div className="card-header">
              <div className="card-header-icon" style={{background: 'var(--teal-dim)'}}>
                <UserIcon className="w-5 h-5" style={{stroke: 'var(--teal)'}} />
              </div>
              <div>
                <h2 className="card-title">Личные данные</h2>
                <p className="card-subtitle">Обновите информацию о себе</p>
              </div>
            </div>

            <form onSubmit={handleProfileSubmit} className="settings-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <div className="input-wrap">
                  <Mail className="input-icon" />
                  <input
                    id="email"
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    className="settings-input"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="first_name">Имя</label>
                  <div className="input-wrap">
                    <User className="input-icon" />
                    <input
                      id="first_name"
                      type="text"
                      value={profileData.first_name}
                      onChange={(e) => setProfileData({ ...profileData, first_name: e.target.value })}
                      className="settings-input"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="last_name">Фамилия</label>
                  <div className="input-wrap">
                    <User className="input-icon" />
                    <input
                      id="last_name"
                      type="text"
                      value={profileData.last_name}
                      onChange={(e) => setProfileData({ ...profileData, last_name: e.target.value })}
                      className="settings-input"
                      required
                    />
                  </div>
                </div>
              </div>

              <button type="submit" className="save-btn" disabled={loading}>
                <Save className="w-4 h-4" />
                {loading ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </form>
          </div>

          {/* Password Change Card */}
          <div className="settings-card">
            <div className="card-header">
              <div className="card-header-icon" style={{background: 'rgba(201,150,42,0.1)'}}>
                <Lock className="w-5 h-5" style={{stroke: 'var(--gold)'}} />
              </div>
              <div>
                <h2 className="card-title">Смена пароля</h2>
                <p className="card-subtitle">Измените пароль для безопасности</p>
              </div>
            </div>

            <form onSubmit={handlePasswordSubmit} className="settings-form">
              <div className="form-group">
                <label htmlFor="oldPassword">Текущий пароль</label>
                <div className="input-wrap">
                  <Lock className="input-icon" />
                  <input
                    id="oldPassword"
                    type={showOldPassword ? 'text' : 'password'}
                    value={passwordData.oldPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                    className="settings-input"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                  >
                    {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">Новый пароль</label>
                <div className="input-wrap">
                  <Lock className="input-icon" />
                  <input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="settings-input"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="input-hint">Минимум 8 символов</p>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Подтвердите новый пароль</label>
                <div className="input-wrap">
                  <Lock className="input-icon" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="settings-input"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" className="save-btn" disabled={passwordLoading}>
                <Lock className="w-4 h-4" />
                {passwordLoading ? 'Изменение...' : 'Изменить пароль'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
