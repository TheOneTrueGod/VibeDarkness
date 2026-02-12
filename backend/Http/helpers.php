<?php

/**
 * Shared HTTP helpers (included by index.php).
 * Use \getJsonBody() and \notFound() from handler code.
 */

if (!function_exists('getJsonBody')) {
    function getJsonBody(): array
    {
        $body = file_get_contents('php://input');
        return json_decode($body, true) ?? [];
    }
}

if (!function_exists('notFound')) {
    function notFound(): array
    {
        http_response_code(404);
        return ['success' => false, 'error' => 'Not found'];
    }
}
