using UnityEngine;

public class CursorManager : MonoBehaviour
{
    void Start()
    {
        // 初始状态：如果需要第一人称视角，通常锁定光标
        // 如果是菜单界面，应该解锁
        UnlockCursor();
    }

    void Update()
    {
        // 按下 ESC 键解锁鼠标，方便用户关闭窗口或进行其他操作
        if (Input.GetKeyDown(KeyCode.Escape))
        {
            UnlockCursor();
        }
        
        // 按下鼠标左键重新锁定（如果需要第一人称控制）
        // if (Input.GetMouseButtonDown(0))
        // {
        //     LockCursor();
        // }
    }

    public void LockCursor()
    {
        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
    }

    public void UnlockCursor()
    {
        Cursor.lockState = CursorLockMode.None;
        Cursor.visible = true;
    }
}
