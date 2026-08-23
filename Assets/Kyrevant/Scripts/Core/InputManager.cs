using UnityEngine;
using UnityEngine.InputSystem;

public class InputManager : MonoBehaviour
{
    public static InputManager Instance { get; private set; }

    public Vector2 MoveInput { get; private set; }
    public bool JumpPressed { get; private set; }
    public bool AttackPressed { get; private set; }
    public Vector2 LookInput { get; private set; }

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
        DontDestroyOnLoad(gameObject);
    }

    private void Update()
    {
        ReadKeyboardAndMouseInput();
    }

    private void ReadKeyboardAndMouseInput()
    {
        Vector2 move = Vector2.zero;

        if (Keyboard.current != null)
        {
            if (Keyboard.current.wKey.isPressed)
                move.y += 1f;

            if (Keyboard.current.sKey.isPressed)
                move.y -= 1f;

            if (Keyboard.current.aKey.isPressed)
                move.x -= 1f;

            if (Keyboard.current.dKey.isPressed)
                move.x += 1f;

            JumpPressed = Keyboard.current.spaceKey.wasPressedThisFrame;
        }
        else
        {
            JumpPressed = false;
        }

        if (Mouse.current != null)
        {
            AttackPressed = Mouse.current.leftButton.wasPressedThisFrame;
            LookInput = Mouse.current.delta.ReadValue();
        }
        else
        {
            AttackPressed = false;
            LookInput = Vector2.zero;
        }

        MoveInput = Vector2.ClampMagnitude(move, 1f);
    }
}