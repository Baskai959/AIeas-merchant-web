import React from 'react';
import { Tag } from '@arco-design/web-react';
import {
  fetchLiveAnalysisReport,
  LiveAnalysisReportTask,
  LiveSession,
} from '@/services/liveRoom';

export const REPORT_POLL_INTERVAL_MS = 3000;

export type StoredLiveAnalysisReportTask = LiveAnalysisReportTask & {
  sessionId: string;
  liveRoomId?: string;
};

function normalizeReportTask(
  sessionId: string | number,
  task: LiveAnalysisReportTask,
  extra: { liveRoomId?: string | number } = {}
): StoredLiveAnalysisReportTask {
  return {
    ...task,
    sessionId: String(sessionId),
    liveRoomId:
      extra.liveRoomId !== undefined ? String(extra.liveRoomId) : undefined,
  };
}

export async function fetchLiveAnalysisReportTask(
  sessionId: string | number,
  extra: { liveRoomId?: string | number } = {}
) {
  const task = await fetchLiveAnalysisReport(sessionId);
  return normalizeReportTask(sessionId, task, extra);
}

export async function fetchLiveAnalysisReportTaskMap(sessions: LiveSession[]) {
  const endedSessions = sessions.filter((session) => session.status === 'ENDED');
  const tasks = await Promise.all(
    endedSessions.map((session) =>
      fetchLiveAnalysisReportTask(session.id, {
        liveRoomId: session.liveRoomId,
      }).catch(() => undefined)
    )
  );

  return tasks.reduce<Record<string, StoredLiveAnalysisReportTask>>(
    (result, task) => {
      if (task) {
        result[task.sessionId] = task;
      }
      return result;
    },
    {}
  );
}

export async function refreshLiveAnalysisReportTask(
  task: StoredLiveAnalysisReportTask
) {
  return fetchLiveAnalysisReportTask(task.sessionId, {
    liveRoomId: task.liveRoomId,
  });
}

export function hasGeneratedReport(task?: LiveAnalysisReportTask) {
  return !!task?.report?.trim();
}

export function isReportTaskRunning(task?: LiveAnalysisReportTask) {
  return !!task && task.status !== 'FAILED' && !hasGeneratedReport(task);
}

export function canViewReport(task?: LiveAnalysisReportTask) {
  return hasGeneratedReport(task);
}

export function renderReportStatus(task?: LiveAnalysisReportTask) {
  if (!task) {
    return <Tag color="arcoblue">AI报告生成中</Tag>;
  }
  if (task.status === 'FAILED') {
    return <Tag color="red">AI报告生成失败</Tag>;
  }
  if (hasGeneratedReport(task)) {
    return <Tag color="green">AI报告已生成</Tag>;
  }
  return <Tag color="arcoblue">AI报告生成中</Tag>;
}
