import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import PageHead from "../components/PageHead.jsx";

function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function Notifications() {
  const { myNotifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useApp();
  const modals = useModals();

  function open(n) {
    if (!n.read) markNotificationRead(n.id);
    if (n.task_id) modals.openTask(n.task_id);
  }

  return (
    <>
      <PageHead
        title="Notifications"
        sub="Updates on your tasks — including change requests from your reviewer."
        actions={
          unreadCount > 0 && (
            <button className="btn ghost" onClick={markAllNotificationsRead}>
              Mark all read
            </button>
          )
        }
      />
      <div className="panel">
        {myNotifications.length === 0 ? (
          <div className="empty">No notifications yet.</div>
        ) : (
          myNotifications.map((n) => (
            <div
              key={n.id}
              className="task-row pointer"
              style={n.read ? { opacity: 0.65 } : { borderColor: "#eab9b9", background: "#fdf6f6" }}
              onClick={() => open(n)}
            >
              <div style={{ width: 10 }}>
                {!n.read && (
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--red)" }} />
                )}
              </div>
              <div className="task-body">
                <div className="task-title" style={{ fontWeight: n.read ? 500 : 700 }}>
                  {n.message}
                </div>
                <div className="task-meta">
                  <span>{timeAgo(n.created_at)}</span>
                  {n.task_id && <span>· open task →</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
