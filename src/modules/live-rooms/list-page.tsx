import { useEffect, useRef, useState } from 'react';
import { Card, Spin } from '@arco-design/web-react';
import { useHistory } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import {
  LiveRoom,
  createLiveRoom,
  listLiveRooms,
} from '@/services/liveRoom';
import { useSessionStore } from '@/store';

function pickRoom(result: any): LiveRoom | undefined {
  if (!result) {
    return undefined;
  }
  if (Array.isArray(result)) {
    return result[0];
  }
  return (
    (result.liveRooms && result.liveRooms[0]) ||
    (result.rooms && result.rooms[0]) ||
    (result.items && result.items[0])
  );
}

export default function LiveRoomEntryPage() {
  const history = useHistory();
  const sessionUser = useSessionStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const ensuringRef = useRef(false);

  async function ensureRoom() {
    if (ensuringRef.current) {
      return;
    }
    ensuringRef.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await listLiveRooms({
        merchantId: sessionUser?.id,
        limit: 1,
        offset: 0,
      });
      let room = pickRoom(result);
      if (!room) {
        room = await createLiveRoom({
          title: sessionUser?.nickname
            ? `${sessionUser.nickname} 的直播间`
            : '我的直播间',
          status: 'OFFLINE',
        });
      }
      history.replace(`/live-rooms/${room.id}/workbench`);
    } catch (err) {
      setError('直播间加载失败，请稍后重试');
    } finally {
      setLoading(false);
      ensuringRef.current = false;
    }
  }

  useEffect(() => {
    ensureRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppPage title="我的直播间">
      <Card>
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <Spin />
            <div style={{ marginTop: 12 }}>正在准备您的直播间...</div>
          </div>
        ) : error ? (
          <AppState
            status="500"
            title="直播间加载失败"
            subtitle={error}
            actionText="重新加载"
            onAction={ensureRoom}
          />
        ) : null}
      </Card>
    </AppPage>
  );
}
