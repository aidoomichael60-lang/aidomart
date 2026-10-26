document.addEventListener("DOMContentLoaded", function () {
    const badge = document.getElementById('notification-badge');
    const countBadge = document.getElementById('notification-count-badge');
    const container = document.getElementById('notification-items-container');

    if (!badge || !container) return;

    function fetchNotifications() {
        fetch('/api/notifications', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => {
            if (!response.ok) return null;
            return response.json();
        })
        .then(data => {
            if (!data) return;

            // Update badge count
            if (data.unread_count > 0) {
                badge.textContent = data.unread_count;
                badge.style.display = 'inline-block';
                if (countBadge) countBadge.textContent = `${data.unread_count} New`;
            } else {
                badge.style.display = 'none';
                if (countBadge) countBadge.textContent = '0 New';
            }

            // Populate items
            if (data.notifications.length === 0) {
                container.innerHTML = '<div class="p-4 text-center text-muted small">No notifications right now.</div>';
            } else {
                let html = '';
                data.notifications.forEach(n => {
                    const unreadClass = n.is_read ? '' : 'unread';
                    html += `
                        <div class="notification-item ${unreadClass}" data-id="${n.id}">
                            <div class="fw-bold text-dark small mb-1">${n.title}</div>
                            <div class="text-muted" style="font-size: 0.8rem; line-height: 1.2;">${n.message}</div>
                            <div class="text-secondary mt-1" style="font-size: 0.65rem;"><i class="fa-regular fa-clock me-1"></i>${n.created_at}</div>
                        </div>
                    `;
                });
                container.innerHTML = html;

                // Add click listener to mark notification as read immediately
                document.querySelectorAll('.notification-item').forEach(item => {
                    item.addEventListener('click', function() {
                        const notifId = this.getAttribute('data-id');
                        markAsRead(notifId, this);
                    });
                });
            }
        })
        .catch(err => console.log('Notification fetch skipped.'));
    }

    function markAsRead(id, element) {
        fetch(`/api/notifications/mark-read/${id}`, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(res => res.json())
        .then(resData => {
            if (resData.success) {
                element.classList.remove('unread');
                fetchNotifications(); // Refresh counter instantly
            }
        });
    }

    // Poll every 15 seconds
    setInterval(fetchNotifications, 15000);
    fetchNotifications();
});