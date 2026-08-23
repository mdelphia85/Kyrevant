using UnityEngine;

public class PlayerController : MonoBehaviour
{
    [SerializeField] private float moveSpeed = 5f;
    [SerializeField] private float gravity = -20f;
    [SerializeField] private float jumpHeight = 2f;
    [SerializeField] private Transform cameraTransform;

    private float verticalVelocity;

    private UnityEngine.CharacterController characterController;

    private void Awake()
    {
        characterController = GetComponent<UnityEngine.CharacterController>();
    }

    private void Update()
    {
        if (InputManager.Instance == null)
        {
            return;
        }

        Vector2 input = InputManager.Instance.MoveInput;

        if (characterController.isGrounded)
        {
            if (verticalVelocity < 0f)
            {
                verticalVelocity = -2f;
            }

            if (InputManager.Instance.JumpPressed)
            {
                verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
            }
        }

        verticalVelocity += gravity * Time.deltaTime;

        Vector3 cameraForward = cameraTransform.forward;
        Vector3 cameraRight = cameraTransform.right;

        cameraForward.y = 0f;
        cameraRight.y = 0f;

        cameraForward.Normalize();
        cameraRight.Normalize();

        Vector3 movement = cameraForward * input.y + cameraRight * input.x;

        if (movement.sqrMagnitude > 0.01f)
        {
            Quaternion targetRotation = Quaternion.LookRotation(movement);

            transform.rotation = Quaternion.Slerp(
                transform.rotation,
                targetRotation,
                10f * Time.deltaTime
            );
        }

        Vector3 horizontalMovement = movement * moveSpeed;
        horizontalMovement.y = verticalVelocity;

        characterController.Move(horizontalMovement * Time.deltaTime);
    }
}