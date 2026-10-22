param(
    [string]$ApiKey = $env:OPENROUTER_API_KEY,
    [string]$Model = "z-ai/glm-5.3-flash",
    [ValidateRange(128, 4096)]
    [int]$MaxTokens = 256,
    [int]$TimeoutSeconds = 45,
    [switch]$EnableReasoning
)

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "Set OPENROUTER_API_KEY before running this script."
}

$headers = @{
    Authorization = "Bearer $ApiKey"
    "Content-Type" = "application/json; charset=utf-8"
}

$body = @{
    model = $Model
    messages = @(
        @{
            role = "system"
            content = "You are a helpful assistant. Reply with exactly the requested text."
        },
        @{
            role = "user"
            content = "Reply with exactly: OpenRouter test passed"
        }
    )
    temperature = 0.2
    max_tokens = $MaxTokens
}

if ($EnableReasoning) {
    $body.reasoning = @{ enabled = $true }
}

$body = $body | ConvertTo-Json -Depth 6

try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "https://openrouter.ai/api/v1/chat/completions" `
        -Headers $headers `
        -Body $body `
        -TimeoutSec $TimeoutSeconds `
        -ErrorAction Stop

    if ($null -ne $response.error) {
        $message = $response.error.message
        $code = $response.error.code
        throw "OpenRouter returned an error payload${code}: $message"
    }

    if ($null -eq $response.choices -or $response.choices.Count -eq 0) {
        $payload = $response | ConvertTo-Json -Depth 8 -Compress
        throw "OpenRouter returned no completion choices. Payload: $payload"
    }

    $content = $response.choices[0].message.content
    if ([string]::IsNullOrWhiteSpace($content)) {
        $payload = $response | ConvertTo-Json -Depth 8 -Compress
        throw "OpenRouter returned an empty completion. Payload: $payload"
    }

    Write-Host "Model: $($response.model)"
    Write-Host "Response:"
    Write-Output $content
}
catch {
    $httpResponse = $_.Exception.Response
    if ($httpResponse) {
        $statusCode = [int]$httpResponse.StatusCode
        $details = $_.ErrorDetails.Message
        if ([string]::IsNullOrWhiteSpace($details)) {
            try {
                $reader = [System.IO.StreamReader]::new($httpResponse.GetResponseStream())
                $details = $reader.ReadToEnd()
                $reader.Dispose()
            }
            catch {
                $details = "No response body was available."
            }
        }
        throw "OpenRouter returned HTTP $statusCode. $details"
    }

    throw
}
