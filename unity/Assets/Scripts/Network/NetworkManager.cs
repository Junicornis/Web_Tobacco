using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

public class NetworkManager : MonoBehaviour
{
    public static NetworkManager Instance;
    public string baseUrl = "http://localhost:3000/api";
    private string authToken;

    private void Awake()
    {
        if (Instance == null) Instance = this;
        else Destroy(gameObject);

        DontDestroyOnLoad(gameObject);
    }

    public void SetToken(string token)
    {
        this.authToken = token;
    }

    public IEnumerator VerifyToken(System.Action<bool> callback)
    {
        if (string.IsNullOrEmpty(authToken))
        {
            // 尝试读取
            TokenReader reader = GetComponent<TokenReader>();
            if (reader != null)
            {
                authToken = reader.ReadToken();
            }
        }

        if (string.IsNullOrEmpty(authToken))
        {
            Debug.LogError("No token available");
            callback?.Invoke(false);
            yield break;
        }

        UnityWebRequest request = UnityWebRequest.Get(baseUrl + "/auth/verify");
        request.SetRequestHeader("Authorization", "Bearer " + authToken);

        yield return request.SendWebRequest();

        if (request.result == UnityWebRequest.Result.Success)
        {
            Debug.Log("Token Verified: " + request.downloadHandler.text);
            callback?.Invoke(true);
        }
        else
        {
            Debug.LogError("Token Verification Failed: " + request.error);
            callback?.Invoke(false);
        }
    }

    // 示例：提交答题记录
    public IEnumerator SubmitAnswer(string questionId, string answer, bool isCorrect)
    {
        // 构建 JSON Body
        string json = $"{{\"questionId\":\"{questionId}\", \"answer\":\"{answer}\", \"isCorrect\":{(isCorrect ? "true" : "false")}}}";

        UnityWebRequest request = new UnityWebRequest(baseUrl + "/training/answer", "POST");
        byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(json);
        request.uploadHandler = new UploadHandlerRaw(bodyRaw);
        request.downloadHandler = new DownloadHandlerBuffer();

        request.SetRequestHeader("Content-Type", "application/json");
        request.SetRequestHeader("Authorization", "Bearer " + authToken);

        yield return request.SendWebRequest();

        if (request.result == UnityWebRequest.Result.Success)
        {
            Debug.Log("Answer submitted successfully");
        }
        else
        {
            Debug.LogError("Error submitting answer: " + request.error);
        }
    }
}
