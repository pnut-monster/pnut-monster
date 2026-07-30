SELECT user_id, count(*) as completed_orders
FROM orders WHERE status = 'picked_up'
GROUP BY user_id
ORDER BY completed_orders DESC
LIMIT 10;
