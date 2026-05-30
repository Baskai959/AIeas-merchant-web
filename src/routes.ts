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
    name: 'menu.liveRooms',
    key: 'live-rooms',
    children: [
      {
        name: 'menu.liveRooms.list',
        key: 'live-rooms/list',
        path: '/live-rooms',
        requiredPermissions: [{ resource: 'live-rooms', actions: ['read'] }],
      },
      {
        name: 'menu.liveRooms.workbench',
        key: 'live-rooms/workbench',
        path: '/live-rooms/:id/workbench',
        ignore: true,
        requiredPermissions: [{ resource: 'live-rooms', actions: ['read'] }],
      },
      {
        name: 'menu.liveRooms.sessions',
        key: 'live-rooms/sessions',
        path: '/live-rooms/:id/sessions',
        ignore: true,
        requiredPermissions: [{ resource: 'live-rooms', actions: ['read'] }],
      },
      {
        name: 'menu.liveRooms.control',
        key: 'live-rooms/control',
        path: '/live-rooms/:id/control',
        ignore: true,
        requiredPermissions: [{ resource: 'live-rooms', actions: ['read'] }],
      },
    ],
  },
  {
    name: 'menu.liveRooms.sessionDetail',
    key: 'live-sessions/detail',
    path: '/live-sessions/:sessionId',
    ignore: true,
    requiredPermissions: [{ resource: 'live-rooms', actions: ['read'] }],
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
    name: 'menu.items',
    key: 'items',
    children: [
      {
        name: 'menu.items.list',
        key: 'items/list',
        requiredPermissions: [{ resource: 'items', actions: ['read'] }],
      },
      {
        name: 'menu.items.create',
        key: 'items/create',
        path: '/items/create',
        ignore: true,
        requiredPermissions: [{ resource: 'items', actions: ['write'] }],
      },
      {
        name: 'menu.items.detail',
        key: 'items/detail',
        path: '/items/:id',
        ignore: true,
        requiredPermissions: [{ resource: 'items', actions: ['read'] }],
      },
      {
        name: 'menu.items.edit',
        key: 'items/edit',
        path: '/items/:id/edit',
        ignore: true,
        requiredPermissions: [{ resource: 'items', actions: ['write'] }],
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
    requiredPermissions: [{ resource: 'audit-logs', actions: ['read'] }],
  },
];

export function generatePermission(role?: string): PermissionMap {
  if (role === 'merchant') {
    return {
      items: ['read', 'write'],
      auctions: ['read', 'write'],
      'live-rooms': ['read', 'write'],
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
