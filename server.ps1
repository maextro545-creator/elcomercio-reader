<#
.SYNOPSIS
  Mini servidor HTTP para El Comercio Reader
.DESCRIPTION
  Sirve archivos estáticos y proxea el RSS feed de elcomercio.pe
  para evitar restricciones de CORS en el navegador.
#>

$Port = 3000
$PublicDir = Join-Path $PSScriptRoot "public"

$CacheDurationSec = 300 # 5 minutes cache
$Global:LastFetchTime = [DateTime]::MinValue
$Global:CachedRss = $null

# Create HTTP listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
    $listener.Start()
    Write-Host ""
    Write-Host "  ================================================" -ForegroundColor Yellow
    Write-Host "  |   EL COMERCIO - Lector de Noticias            |" -ForegroundColor Yellow  
    Write-Host "  |   Servidor corriendo en:                      |" -ForegroundColor Yellow
    Write-Host "  |   http://localhost:$Port/                      |" -ForegroundColor Cyan
    Write-Host "  |   Presiona Ctrl+C para detener                |" -ForegroundColor Yellow
    Write-Host "  ================================================" -ForegroundColor Yellow
    Write-Host ""

    # Open browser automatically
    Start-Process "http://localhost:$Port/"

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $($request.HttpMethod) $path" -ForegroundColor Gray

        try {
            if ($path -eq "/api/rss") {
                # Proxy the RSS feed with caching
                $now = Get-Date
                $needsFetch = $false
                
                if ($null -eq $Global:CachedRss -or ($now - $Global:LastFetchTime).TotalSeconds -gt $CacheDurationSec) {
                    $needsFetch = $true
                }
                
                if ($needsFetch) {
                    Write-Host "  -> Cache expirado o vacio. Descargando RSS de elcomercio.pe..." -ForegroundColor Cyan
                    $webClient = New-Object System.Net.WebClient
                    $webClient.Encoding = [System.Text.Encoding]::UTF8
                    $webClient.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    $webClient.Headers.Add("Accept", "application/rss+xml, application/xml, text/xml, */*")
                    
                    try {
                        $rssContent = $webClient.DownloadString("https://elcomercio.pe/arcio/rss/")
                        $Global:CachedRss = $rssContent
                        $Global:LastFetchTime = Get-Date
                        Write-Host "  -> Descargado con exito ($($rssContent.Length) caracteres)." -ForegroundColor Green
                    }
                    catch {
                        Write-Host "  -> Error descargando RSS: $_" -ForegroundColor Red
                        # If we have stale cache, use it
                        if ($null -ne $Global:CachedRss) {
                            Write-Host "  -> Usando cache expirado de respaldo." -ForegroundColor Yellow
                        } else {
                            throw $_
                        }
                    }
                    finally {
                        $webClient.Dispose()
                    }
                } else {
                    $age = [Math]::Round(($now - $Global:LastFetchTime).TotalSeconds)
                    Write-Host "  -> Usando RSS en cache (edad: $($age)s)" -ForegroundColor DarkGreen
                }
                
                # Send the response
                $response.ContentType = "application/xml; charset=utf-8"
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.Headers.Add("Cache-Control", "max-age=300")
                
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($Global:CachedRss)
                $response.ContentLength64 = $buffer.Length
                if ($request.HttpMethod -ne "HEAD") {
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                }
                
                Write-Host "  -> RSS enviado correctamente ($($buffer.Length) bytes)" -ForegroundColor Green
            }
            elseif ($path -eq "/api/scrape") {
                # Scrape article URL
                $targetUrl = $request.QueryString["url"]
                if ($null -eq $targetUrl) {
                    $response.StatusCode = 400
                    $msg = '{"error":"Falta parametro url"}'
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($msg)
                    $response.ContentType = "application/json"
                    $response.ContentLength64 = $buffer.Length
                    if ($request.HttpMethod -ne "HEAD") {
                        $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    }
                }
                else {
                    Write-Host "  -> Scraping URL: $targetUrl" -ForegroundColor Cyan
                    $webClient = New-Object System.Net.WebClient
                    $webClient.Encoding = [System.Text.Encoding]::UTF8
                    $webClient.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    
                    try {
                        $htmlContent = $webClient.DownloadString($targetUrl)
                        $response.ContentType = "text/html; charset=utf-8"
                        $response.Headers.Add("Access-Control-Allow-Origin", "*")
                        
                        $buffer = [System.Text.Encoding]::UTF8.GetBytes($htmlContent)
                        $response.ContentLength64 = $buffer.Length
                        if ($request.HttpMethod -ne "HEAD") {
                            $response.OutputStream.Write($buffer, 0, $buffer.Length)
                        }
                        Write-Host "  -> Scraped HTML enviado correctamente ($($buffer.Length) bytes)" -ForegroundColor Green
                    }
                    catch {
                        Write-Host "  -> Error scraping: $_" -ForegroundColor Red
                        $response.StatusCode = 502
                        $errorMsg = '{"error":"No se pudo obtener el contenido del enlace"}'
                        $buffer = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
                        $response.ContentType = "application/json"
                        $response.ContentLength64 = $buffer.Length
                        if ($request.HttpMethod -ne "HEAD") {
                            $response.OutputStream.Write($buffer, 0, $buffer.Length)
                        }
                    }
                    finally {
                        $webClient.Dispose()
                    }
                }
            }
            else {
                # Serve static files
                if ($path -eq "/" -or $path -eq "") {
                    $path = "/index.html"
                }
                
                $filePath = Join-Path $PublicDir ($path.TrimStart('/').Replace('/', '\'))
                
                if (Test-Path $filePath -PathType Leaf) {
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $contentType = switch ($ext) {
                        ".html" { "text/html; charset=utf-8" }
                        ".css"  { "text/css; charset=utf-8" }
                        ".js"   { "application/javascript; charset=utf-8" }
                        ".json" { "application/json; charset=utf-8" }
                        ".png"  { "image/png" }
                        ".jpg"  { "image/jpeg" }
                        ".gif"  { "image/gif" }
                        ".svg"  { "image/svg+xml" }
                        ".ico"  { "image/x-icon" }
                        default { "application/octet-stream" }
                    }
                    
                    $response.ContentType = $contentType
                    $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
                    $response.ContentLength64 = $fileBytes.Length
                    if ($request.HttpMethod -ne "HEAD") {
                        $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
                    }
                }
                else {
                    # Fallback to index.html (SPA behavior)
                    $indexPath = Join-Path $PublicDir "index.html"
                    if (Test-Path $indexPath) {
                        $response.ContentType = "text/html; charset=utf-8"
                        $fileBytes = [System.IO.File]::ReadAllBytes($indexPath)
                        $response.ContentLength64 = $fileBytes.Length
                        if ($request.HttpMethod -ne "HEAD") {
                            $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
                        }
                    }
                    else {
                        $response.StatusCode = 404
                        $msg = "404 - Archivo no encontrado: $path"
                        $buffer = [System.Text.Encoding]::UTF8.GetBytes($msg)
                        $response.ContentLength64 = $buffer.Length
                        $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    }
                }
            }
        }
        catch {
            Write-Host "  -> Error: $_" -ForegroundColor Red
            $response.StatusCode = 500
        }
        finally {
            $response.OutputStream.Close()
        }
    }
}
catch {
    Write-Host "Error al iniciar el servidor: $_" -ForegroundColor Red
    Write-Host "Asegurate de que el puerto $Port no este en uso." -ForegroundColor Yellow
}
finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "`nServidor detenido." -ForegroundColor Yellow
}
