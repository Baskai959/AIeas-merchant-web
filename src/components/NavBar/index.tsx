import { useContext } from 'react';
import {
  Tooltip,
  Avatar,
  Dropdown,
  Menu,
  Space,
} from '@arco-design/web-react';
import {
  IconSunFill,
  IconMoonFill,
  IconUser,
  IconSettings,
  IconPoweroff,
} from '@arco-design/web-react/icon';
import { GlobalContext } from '@/context';
import useLocale from '@/utils/useLocale';
import Logo from '@/assets/logo.svg';
import IconButton from './IconButton';
import styles from './style/index.module.less';
import { redirectToLogin } from '@/services/http/storage';
import { useSessionStore } from '@/store';

function Navbar({ show }: { show: boolean }) {
  const t = useLocale();
  const userInfo = useSessionStore((state) => state.user);
  const logout = useSessionStore((state) => state.logout);
  const { theme, setTheme } = useContext(GlobalContext);

  async function onMenuItemClick(key: string) {
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
          <Logo />
          <div className={styles['logo-name']}>商家竞拍后台</div>
        </div>
      </div>
      <ul className={styles.right}>
        <li>
          <Tooltip
            content={
              theme === 'light'
                ? t['settings.navbar.theme.toDark']
                : t['settings.navbar.theme.toLight']
            }
          >
            <IconButton
              icon={theme !== 'dark' ? <IconMoonFill /> : <IconSunFill />}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            />
          </Tooltip>
        </li>
        {userInfo && (
          <li>
            <Dropdown droplist={droplist} position="br">
              <Space size={8} style={{ cursor: 'pointer' }}>
                <Avatar size={32}>
                  {userInfo.nickname?.slice(0, 1) || <IconUser />}
                </Avatar>
                <span>{userInfo.nickname}</span>
              </Space>
            </Dropdown>
          </li>
        )}
      </ul>
    </div>
  );
}

export default Navbar;
