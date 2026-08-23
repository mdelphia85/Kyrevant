using UnityEngine;

public class EnemyController : MonoBehaviour
{
    [SerializeField] private Transform target;
    [SerializeField] private float detectionRange = 10f;
    [SerializeField] private float rotationSpeed = 5f;

    private bool playerDetected;

    private void Update()
    {
        if (target == null)
        {
            return;
        }

        float distanceToTarget = Vector3.Distance(
            transform.position,
            target.position
        );

        bool detected = distanceToTarget <= detectionRange;

        if (detected != playerDetected)
        {
            playerDetected = detected;

            if (playerDetected)
            {
                Debug.Log("Enemy detected player.");
            }
            else
            {
                Debug.Log("Enemy lost player.");
            }
        }

        if (playerDetected)
        {
            Vector3 direction = target.position - transform.position;
            direction.y = 0f;

            if (direction.sqrMagnitude > 0.01f)
            {
                Quaternion targetRotation = Quaternion.LookRotation(direction);

                transform.rotation = Quaternion.Slerp(
                    transform.rotation,
                    targetRotation,
                    rotationSpeed * Time.deltaTime
                );
            }
        }
    }
}