import React, { useState } from 'react';
import { Avatar, Dropdown, Menu, Space } from '@arco-design/web-react';
import {
  IconUser,
  IconSettings,
  IconPoweroff,
} from '@arco-design/web-react/icon';
import useLocale from '@/utils/useLocale';
import Logo from '@/assets/logo.png';
import styles from './style/index.module.less';
import { redirectToLogin } from '@/services/http/storage';
import { useSessionStore } from '@/store';
import UserSettingsModal from './UserSettingsModal';

function Navbar({ show }: { show: boolean }) {
  const t = useLocale();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const userInfo = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const logout = useSessionStore((state) => state.logout);
  const avatarUrl = userInfo?.avatarUrl || userInfo?.avatar || '';

  async function onMenuItemClick(key: string) {
    if (key === 'setting') {
      setSettingsVisible(true);
      return;
    }
    if (key === 'logout') {
      await logout();
      redirectToLogin();
    }
  }

  if (!show) {
    return null;
  }

  const droplist = (
    <Menu onClickMenuItem={onMenuItemClick}>
      <Menu.Item key="setting">
        <IconSettings className={styles['dropdown-icon']} />
        {t['menu.user.setting']}
      </Menu.Item>
      <Menu.Item key="logout">
        <IconPoweroff className={styles['dropdown-icon']} />
        {t['navbar.logout']}
      </Menu.Item>
    </Menu>
  );

  return (
    <div className={styles.navbar}>
      <div className={styles.left}>
        <div className={styles.logo}>
          <img className={styles['logo-mark']} src={Logo} alt="商家竞拍后台" />
          <div className={styles['logo-name']}>商家竞拍后台</div>
        </div>
      </div>
      <ul className={styles.right}>
        {userInfo && (
          <li>
            <Dropdown droplist={droplist} position="br">
              <Space
                size={8}
                className={styles['user-profile']}
                style={{ cursor: 'pointer' }}
              >
                <Avatar size={32}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={userInfo.nickname} />
                  ) : (
                    userInfo.nickname?.slice(0, 1) || <IconUser />
                  )}
                </Avatar>
                <span className={styles.username}>{userInfo.nickname}</span>
              </Space>
            </Dropdown>
          </li>
        )}
      </ul>
      <UserSettingsModal
        visible={settingsVisible}
        user={userInfo}
        onCancel={() => setSettingsVisible(false)}
        onUpdated={setUser}
      />
    </div>
  );
}

export default Navbar;
