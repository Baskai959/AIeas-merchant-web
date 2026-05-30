import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Switch,
  Route,
  Redirect,
  matchPath,
  useHistory,
} from 'react-router-dom';
import { Layout, Menu, Breadcrumb, Spin } from '@arco-design/web-react';
import cs from 'classnames';
import {
  IconClockCircle,
  IconFile,
  IconFire,
  IconMenuFold,
  IconMenuUnfold,
  IconStorage,
  IconTags,
  IconTrophy,
  IconVideoCamera,
} from '@arco-design/web-react/icon';
import NProgress from 'nprogress';
import Navbar from './components/NavBar';
import Footer from './components/Footer';
import useRoute, { IRoute } from '@/routes';
import { isArray } from './utils/is';
import useLocale from './utils/useLocale';
import getUrlParams from './utils/getUrlParams';
import lazyload from './utils/lazyload';
import PermissionWrapper from './components/PermissionWrapper';
import { useSessionStore, useSettingsStore } from './store';
import styles from './style/layout.module.less';

const MenuItem = Menu.Item;
const SubMenu = Menu.SubMenu;

const Sider = Layout.Sider;
const Content = Layout.Content;

const ForbiddenPage = lazyload(() => import('./pages/exception/403'));

function getIconFromKey(key: string) {
  const iconProps = { className: styles['menu-icon-svg'] };
  const iconMap: Record<
    string,
    { icon: React.ReactNode; className: string }
  > = {
    'live-rooms': {
      icon: <IconVideoCamera {...iconProps} />,
      className: styles['icon-live'],
    },
    'live-rooms/list': {
      icon: <IconVideoCamera {...iconProps} />,
      className: styles['icon-live'],
    },
    auctions: {
      icon: <IconTrophy {...iconProps} />,
      className: styles['icon-auction'],
    },
    'auctions/list': {
      icon: <IconFire {...iconProps} />,
      className: styles['icon-auction-list'],
    },
    items: {
      icon: <IconStorage {...iconProps} />,
      className: styles['icon-item'],
    },
    'items/list': {
      icon: <IconStorage {...iconProps} />,
      className: styles['icon-item'],
    },
    orders: {
      icon: <IconFile {...iconProps} />,
      className: styles['icon-order'],
    },
    'orders/list': {
      icon: <IconFile {...iconProps} />,
      className: styles['icon-order'],
    },
    'audit-logs': {
      icon: <IconClockCircle {...iconProps} />,
      className: styles['icon-log'],
    },
  };
  const meta = iconMap[key] || {
    icon: <IconTags {...iconProps} />,
    className: styles['icon-default'],
  };

  return (
    <span className={cs(styles.icon, meta.className)}>
      {meta.icon}
    </span>
  );
}

function getFlattenRoutes(routes: IRoute[]) {
  const mod = import.meta.glob('./pages/**/index.tsx');
  const res: IRoute[] = [];
  function travel(_routes: IRoute[]) {
    _routes.forEach((route: IRoute) => {
      if (route.key && !route.children) {
        const loader = mod[`./pages/${route.key}/index.tsx`];
        if (!loader) {
          return;
        }
        route.component = lazyload(loader);
        res.push(route);
      } else if (isArray(route.children) && route.children.length) {
        travel(route.children);
      }
    });
  }
  travel(routes);
  return res;
}

function getRoutePath(route: IRoute) {
  return route.path || `/${route.key}`;
}

function getMatchedRoute(pathname: string, routes: IRoute[]) {
  return routes.find((route) =>
    matchPath(pathname, {
      path: getRoutePath(route),
      exact: true,
      strict: false,
    })
  );
}

function PageLayout() {
  const urlParams = getUrlParams();
  const history = useHistory();
  const pathname = history.location.pathname;
  const currentComponent = pathname.replace(/^\//, '');
  const locale = useLocale();
  const settings = useSettingsStore((state) => state.settings);
  const initialized = useSessionStore((state) => state.initialized);
  const permissions = useSessionStore((state) => state.permissions);

  const [routes, defaultRoute] = useRoute(permissions);
  const defaultSelectedKeys = [currentComponent || defaultRoute];
  const paths = (currentComponent || defaultRoute).split('/');
  const defaultOpenKeys = paths.slice(0, paths.length - 1);

  const [breadcrumb, setBreadCrumb] = useState([]);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [selectedKeys, setSelectedKeys] =
    useState<string[]>(defaultSelectedKeys);
  const [openKeys, setOpenKeys] = useState<string[]>(defaultOpenKeys);

  const routeMap = useRef<Map<string, React.ReactNode[]>>(new Map());
  const menuMap = useRef<
    Map<string, { menuItem?: boolean; subMenu?: boolean }>
  >(new Map());

  const navbarHeight = 60;
  const menuWidth = collapsed ? 48 : settings.menuWidth;

  const showNavbar = settings.navbar && urlParams.navbar !== false;
  const showMenu = settings.menu && urlParams.menu !== false;
  const showFooter = settings.footer && urlParams.footer !== false;

  const flattenRoutes = useMemo(() => getFlattenRoutes(routes) || [], [routes]);

  function onClickMenuItem(key: string) {
    const currentRoute = flattenRoutes.find((r) => r.key === key);
    if (!currentRoute?.component) {
      return;
    }
    const component = currentRoute.component;
    const preload = component.preload();
    NProgress.start();
    preload.then(() => {
      history.push(currentRoute.path ? currentRoute.path : `/${key}`);
      NProgress.done();
    });
  }

  function toggleCollapse() {
    setCollapsed((collapsed) => !collapsed);
  }

  const paddingLeft = showMenu ? { paddingLeft: menuWidth } : {};
  const paddingTop = showNavbar ? { paddingTop: navbarHeight } : {};
  const paddingStyle = { ...paddingLeft, ...paddingTop };

  function renderRoutes(localeMap: Record<string, string>) {
    routeMap.current.clear();
    return function travel(
      _routes: IRoute[],
      level: number,
      parentNode: React.ReactNode[] = []
    ) {
      return _routes.map((route) => {
        const { breadcrumb = true, ignore } = route;
        const iconDom = getIconFromKey(route.key);
        const titleDom = (
          <>
            {iconDom} {localeMap[route.name] || route.name}
          </>
        );

        routeMap.current.set(
          route.key,
          breadcrumb ? [...parentNode, route.name] : []
        );

        const visibleChildren = (route.children || []).filter((child) => {
          const { ignore, breadcrumb = true } = child;
          if (ignore || route.ignore) {
            routeMap.current.set(
              child.key,
              breadcrumb ? [...parentNode, route.name, child.name] : []
            );
          }

          return !ignore;
        });

        if (ignore) {
          return '';
        }
        if (visibleChildren.length) {
          menuMap.current.set(route.key, { subMenu: true });
          return (
            <SubMenu key={route.key} title={titleDom}>
              {travel(visibleChildren, level + 1, [...parentNode, route.name])}
            </SubMenu>
          );
        }
        menuMap.current.set(route.key, { menuItem: true });
        return <MenuItem key={route.key}>{titleDom}</MenuItem>;
      });
    };
  }

  function updateMenuStatus() {
    const activeRoute =
      getMatchedRoute(pathname, flattenRoutes)?.key || currentComponent || defaultRoute;
    const pathKeys = activeRoute.split('/');
    const newSelectedKeys: string[] = [];
    const newOpenKeys: string[] = [...openKeys];
    while (pathKeys.length > 0) {
      const menuKey = pathKeys.join('/');
      const menuType = menuMap.current.get(menuKey);
      if (menuType && menuType.menuItem) {
        newSelectedKeys.push(menuKey);
      }
      if (menuType && menuType.subMenu && !openKeys.includes(menuKey)) {
        newOpenKeys.push(menuKey);
      }
      pathKeys.pop();
    }
    setSelectedKeys(newSelectedKeys);
    setOpenKeys(newOpenKeys);
  }

  useEffect(() => {
    const activeRoute = getMatchedRoute(pathname, flattenRoutes);
    const routeConfig = activeRoute ? routeMap.current.get(activeRoute.key) : [];
    setBreadCrumb(routeConfig || []);
    updateMenuStatus();
  }, [pathname, flattenRoutes]);
  return (
    <Layout className={styles.layout}>
      <div
        className={cs(styles['layout-navbar'], {
          [styles['layout-navbar-hidden']]: !showNavbar,
        })}
      >
        <Navbar show={showNavbar} />
      </div>
      {!initialized ? (
        <Spin className={styles['spin']} />
      ) : (
        <Layout>
          {showMenu && (
            <Sider
              className={styles['layout-sider']}
              width={menuWidth}
              collapsed={collapsed}
              onCollapse={setCollapsed}
              trigger={null}
              collapsible
              breakpoint="xl"
              style={paddingTop}
            >
              <div className={styles['menu-wrapper']}>
                <Menu
                  collapse={collapsed}
                  onClickMenuItem={onClickMenuItem}
                  selectedKeys={selectedKeys}
                  openKeys={openKeys}
                  onClickSubMenu={(_, openKeys) => {
                    setOpenKeys(openKeys);
                  }}
                >
                  {renderRoutes(locale)(routes, 1)}
                </Menu>
              </div>
              <div className={styles['collapse-btn']} onClick={toggleCollapse}>
                {collapsed ? <IconMenuUnfold /> : <IconMenuFold />}
              </div>
            </Sider>
          )}
          <Layout className={styles['layout-content']} style={paddingStyle}>
            <div className={styles['layout-content-wrapper']}>
              {!!breadcrumb.length && (
                <div className={styles['layout-breadcrumb']}>
                  <Breadcrumb>
                    {breadcrumb.map((node, index) => (
                      <Breadcrumb.Item key={index}>
                        {typeof node === 'string' ? locale[node] || node : node}
                      </Breadcrumb.Item>
                    ))}
                  </Breadcrumb>
                </div>
              )}
              <Content>
                <Switch>
                  {flattenRoutes.map((route, index) => {
                    const CurrentComponent = route.component;
                    return (
                      <Route
                        key={index}
                        exact
                        path={getRoutePath(route)}
                        render={() => (
                          <PermissionWrapper
                            requiredPermissions={route.requiredPermissions}
                            oneOfPerm={route.oneOfPerm}
                            backup={<ForbiddenPage />}
                          >
                            <CurrentComponent />
                          </PermissionWrapper>
                        )}
                      />
                    );
                  })}
                  <Route exact path="/">
                    <Redirect to={`/${defaultRoute}`} />
                  </Route>
                  <Route
                    path="*"
                    component={lazyload(() => import('./pages/exception/403'))}
                  />
                </Switch>
              </Content>
            </div>
            {showFooter && <Footer />}
          </Layout>
        </Layout>
      )}
    </Layout>
  );
}

export default PageLayout;
