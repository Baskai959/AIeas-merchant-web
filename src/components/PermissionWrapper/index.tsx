import React, { useEffect, useState } from 'react';
import authentication, { AuthParams } from '@/utils/authentication';
import { useSessionStore } from '@/store';

type PermissionWrapperProps = AuthParams & {
  backup?: React.ReactNode;
};

const PermissionWrapper = (
  props: React.PropsWithChildren<PermissionWrapperProps>
) => {
  const { backup, requiredPermissions, oneOfPerm } = props;
  const [hasPermission, setHasPermission] = useState(false);
  const permissions = useSessionStore((state) => state.permissions);

  useEffect(() => {
    const hasPermission = authentication(
      { requiredPermissions, oneOfPerm },
      permissions
    );
    setHasPermission(hasPermission);
  }, [requiredPermissions, oneOfPerm, permissions]);

  if (hasPermission) {
    return <>{convertReactElement(props.children)}</>;
  }
  if (backup) {
    return <>{convertReactElement(backup)}</>;
  }
  return null;
};

function convertReactElement(node: React.ReactNode): React.ReactElement {
  if (!React.isValidElement(node)) {
    return <>{node}</>;
  }
  return node;
}

export default PermissionWrapper;
