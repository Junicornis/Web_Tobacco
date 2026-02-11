using System.IO;
using UnityEngine;
using System;

[Serializable]
public class AuthTokenData
{
    public string token;
    public string userId;
    public string username;
    public long timestamp;
    public long expireAt;
}

public class TokenReader : MonoBehaviour
{
    // 假设 Token 文件路径固定，或者通过配置文件读取
    // 注意：这里的路径需要与 Node 后端配置一致
    // 生产环境建议放在 Application.persistentDataPath 或者用户目录下固定位置
    // 这里根据文档暂时硬编码，实际应改为配置
    public string tokenFilePath = @"C:\SafetyTraining\temp\auth_token.json";

    // 用于调试，如果在编辑器模式下，可能路径不同
    public bool useRelativePath = true;

    private void Awake()
    {
        if (useRelativePath)
        {
            // 开发阶段，假设在项目根目录的 temp 下
            // 注意：Unity Editor 的 Directory.GetCurrentDirectory() 通常是项目根目录
            tokenFilePath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "../../temp/auth_token.json"));
        }
    }

    public string ReadToken()
    {
        if (!File.Exists(tokenFilePath))
        {
            Debug.LogError($"Token file not found at: {tokenFilePath}");
            return null;
        }

        try
        {
            string json = File.ReadAllText(tokenFilePath);
            AuthTokenData data = JsonUtility.FromJson<AuthTokenData>(json);

            // 简单验证过期
            long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            // 注意：JS的时间戳是毫秒，这里比较需要统一。Node端生成的是 Date.now() (毫秒)
            // C# DateTime.Now 需要转换

            Debug.Log($"Token loaded for user: {data.username}");

            // 读取后删除文件（根据安全需求）
            // File.Delete(tokenFilePath); 

            return data.token;
        }
        catch (Exception e)
        {
            Debug.LogError($"Error reading token: {e.Message}");
            return null;
        }
    }
}
