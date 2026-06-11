import auth, { AuthParams } from '@/utils/authentication';
import { useEffect, useMemo, useState } from 'react';
import { PermissionMap } from '@/store/session';

export type IRoute = AuthParams & {
  name: string;
  key: string;
  breadcrumb?: boolean;
  children?: IRoute[];
  ignore?: boolean;
  path?: string;
  component?: any;
};

export const routes: IRoute[] = [
  {
    name: 'menu.liveSessions',
    key: 'live-sessions',
    children: [
      {
        name: 'menu.liveSessions.list',
        key: 'live-sessions/list',
        path: '/live-sessions',
        requiredPermissions: [{ resource: 'live-sessions', actions: ['read'] }],
      },
      {
        name: 'menu.liveSessions.workbench',
        key: 'live-sessions/workbench',
        path: '/live-sessions/:id/workbench',
        ignore: true,
        requiredPermissions: [{ resource: 'live-sessions', actions: ['read'] }],
      },
      {
        name: 'menu.liveSessions.records',
        key: 'live-sessions/records',
        path: '/live-sessions/:id/records',
        ignore: true,
        requiredPermissions: [{ resource: 'live-sessions', actions: ['read'] }],
      },
      {
        name: 'menu.liveSessions.control',
        key: 'live-sessions/control',
        path: '/live-sessions/:id/control',
        ignore: true,
        requiredPermissions: [{ resource: 'live-sessions', actions: ['read'] }],
      },
    ],
  },
  {
    name: 'menu.liveSessions.sessionDetail',
    key: 'live-sessions/detail',
    path: '/live-sessions/:sessionId',
    ignore: true,
    requiredPermissions: [{ resource: 'live-sessions', actions: ['read'] }],
  },
  {
    name: 'menu.auctions',
    key: 'auctions',
    children: [
      {
        name: 'menu.auctions.list',
        key: 'auctions/overview',
        ignore: true,
        requiredPermissions: [{ resource: 'auctions', actions: ['read'] }],
      },
      {
        name: 'menu.auctions.list',
        key: 'auctions/list',
        requiredPermissions: [{ resource: 'auctions', actions: ['read'] }],
      },
      {
        name: 'menu.auctions.create',
        key: 'auctions/create',
        path: '/auctions/create',
        ignore: true,
        requiredPermissions: [{ resource: 'auctions', actions: ['write'] }],
      },
      {
        name: 'menu.auctions.detail',
        key: 'auctions/detail',
        path: '/auctions/:id',
        ignore: true,
        requiredPermissions: [{ resource: 'auctions', actions: ['read'] }],
      },
      {
        name: 'menu.auctions.edit',
        key: 'auctions/edit',
        path: '/auctions/:id/edit',
        ignore: true,
        requiredPermissions: [{ resource: 'auctions', actions: ['write'] }],
      },
    ],
  },
  {
    name: 'menu.orders',
    key: 'orders',
    children: [
      {
        name: 'menu.orders.list',
        key: 'orders/list',
        requiredPermissions: [{ resource: 'orders', actions: ['read'] }],
      },
    ],
  },
  {
    name: 'menu.auditLogs',
    key: 'audit-logs',
    ignore: true,
    requiredPermissions: [{ resource: 'audit-logs', actions: ['read'] }],
  },
];

export function generatePermission(role?: string): PermissionMap {
  if (role === 'merchant') {
    return {
      auctions: ['read', 'write'],
      'live-sessions': ['read', 'write'],
      orders: ['read'],
      'audit-logs': ['read'],
    };
  }

  return {};
}

export const getName = (path: string, routes: IRoute[]) => {
  return routes.find((item) => {
    const itemPath = `/${item.key}`;
    if (path === itemPath) {
      return item.name;
    } else if (item.children) {
      return getName(path, item.children);
    }
  });
};

const useRoute = (userPermission: PermissionMap): [IRoute[], string] => {
  const filterRoute = (routes: IRoute[], arr: IRoute[] = []): IRoute[] => {
    if (!routes.length) {
      return [];
    }
    for (const route of routes) {
      const { requiredPermissions, oneOfPerm } = route;
      let visible = true;
      if (requiredPermissions) {
        visible = auth({ requiredPermissions, oneOfPerm }, userPermission);
      }

      if (!visible) {
        continue;
      }
      if (route.children && route.children.length) {
        const newRoute = { ...route, children: [] };
        filterRoute(route.children, newRoute.children);
        if (newRoute.children.length) {
          arr.push(newRoute);
        }
      } else {
        arr.push({ ...route });
      }
    }

    return arr;
  };

  const [permissionRoute, setPermissionRoute] = useState<IRoute[]>(routes);

  useEffect(() => {
    const newRoutes = filterRoute(routes);
    setPermissionRoute(newRoutes);
  }, [userPermission]);

  const defaultRoute = useMemo(() => {
    const first = permissionRoute[0];
    if (first) {
      const firstChild = first?.children?.[0];
      if (firstChild) {
        const childPath = firstChild.path
          ? firstChild.path.replace(/^\//, '')
          : firstChild.key;
        return childPath;
      }
      return first.path ? first.path.replace(/^\//, '') : first.key;
    }
    return '';
  }, [permissionRoute]);

  return [permissionRoute, defaultRoute];
};

export default useRoute;
