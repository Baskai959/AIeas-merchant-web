import { useEffect, useRef, useState } from 'react';
import { Card, Spin } from '@arco-design/web-react';
import { useHistory } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import {
  LiveSession,
  createLiveSession,
  listLiveSessions,
} from '@/services/liveSession';
import { useSessionStore } from '@/store';

function getSessionTime(session: LiveSession) {
  const value =
    session.openedAt ||
    session.scheduledStartTime ||
    session.updatedAt ||
    session.createdAt;
  return value ? new Date(value).getTime() : 0;
}

function pickLatest(sessions: LiveSession[]) {
  return [...sessions].sort((a, b) => getSessionTime(b) - getSessionTime(a))[0];
}

function pickWorkbenchSession(sessions: LiveSession[]) {
  return (
    pickLatest(sessions.filter((session) => session.status === 'LIVE')) ||
    pickLatest(
      sessions.filter(
        (session) =>
          session.status === 'DRAFT' || session.status === 'SCHEDULED'
      )
    )
  );
}

export default function LiveSessionListPage() {
  const history = useHistory();
  const sessionUser = useSessionStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const enteringRef = useRef(false);

  async function enterMyLiveRoom() {
    if (enteringRef.current) {
      return;
    }
    enteringRef.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await listLiveSessions({
        merchantId: sessionUser?.id,
        limit: 50,
        offset: 0,
      });
      let session = pickWorkbenchSession(result.sessions || []);
      if (!session) {
        session = await createLiveSession({
          title: sessionUser?.nickname
            ? `${sessionUser.nickname} 的直播间`
            : '我的直播间',
          status: 'DRAFT',
        });
      }
      history.replace(`/live-sessions/${session.id}/workbench`);
    } catch (err) {
      setError('我的直播间加载失败，请稍后重试');
    } finally {
      setLoading(false);
      enteringRef.current = false;
    }
  }

  useEffect(() => {
    enterMyLiveRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id]);

  return (
    <AppPage title="我的直播间">
      <Card>
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <Spin />
            <div style={{ marginTop: 12 }}>正在进入我的直播间...</div>
          </div>
        ) : error ? (
          <AppState
            status="500"
            title="我的直播间加载失败"
            subtitle={error}
            actionText="重新进入"
            onAction={enterMyLiveRoom}
          />
        ) : null}
      </Card>
    </AppPage>
  );
}
