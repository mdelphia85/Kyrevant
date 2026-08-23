using UnityEngine;

public class ThirdPersonCamera : MonoBehaviour
{
    [SerializeField] private Transform target;
    [SerializeField] private float distance = 6f;
    [SerializeField] private float sensitivity = 0.15f;
    [SerializeField] private float followSpeed = 10f;

    private float yaw;
    private float pitch;

    private void LateUpdate()
    {
        if (target == null)
        {
            return;
        }

        Vector2 lookInput = InputManager.Instance != null
            ? InputManager.Instance.LookInput
            : Vector2.zero;

        yaw += lookInput.x * sensitivity;
        pitch -= lookInput.y * sensitivity;

        pitch = Mathf.Clamp(pitch, -80f, 80f);

        Quaternion rotation = Quaternion.Euler(pitch, yaw, 0f);

        transform.rotation = rotation;
        transform.position = target.position - transform.forward * distance;
    }
}