package org.jahia.se.modules.efficy.service.internal;

import org.jahia.se.modules.efficy.service.config.EfficyServiceConfiguration;
import org.jahia.se.modules.efficy.service.model.EfficyGatewayResponse;
import org.jahia.se.modules.efficy.service.model.EfficyResourceType;
import org.jahia.se.modules.efficy.service.spi.EfficyGatewayService;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.charset.StandardCharsets;

@Component(service = EfficyGatewayService.class)
public class DefaultEfficyGatewayService implements EfficyGatewayService {

    @Reference
    private EfficyServiceConfiguration configuration;

    @Override
    public EfficyGatewayResponse forward(EfficyResourceType resourceType,
                                         String path,
                                         String query,
                                         String method,
                                         String requestBody,
                                         String authorizationHeader,
                                         String userEmail) throws IOException {
        String targetUrl = buildTargetUrl(resourceType, path, query);
        HttpURLConnection connection = (HttpURLConnection) new URL(targetUrl).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(configuration.getConnectTimeoutMs());
        connection.setReadTimeout(configuration.getReadTimeoutMs());
        connection.setRequestProperty("Authorization", authorizationHeader);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Accept-Charset", "utf-8");
        connection.setRequestProperty("Accept-Encoding", "identity");

        if (userEmail != null && !userEmail.isEmpty()) {
            connection.setRequestProperty("X-User-Email", userEmail);
        }

        if (supportsBody(method) && requestBody != null) {
            connection.setDoOutput(true);
            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(requestBody.getBytes(StandardCharsets.UTF_8));
            }
        }

        int status = connection.getResponseCode();
        String contentType = connection.getContentType();

        try (InputStream inputStream = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) {
            String body;
            if (inputStream == null) {
                body = "{}";
            } else {
                body = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
            }

            return new EfficyGatewayResponse(
                    status,
                    contentType != null ? contentType : "application/json;charset=UTF-8",
                    body
            );
        } finally {
            connection.disconnect();
        }
    }

    private String buildTargetUrl(EfficyResourceType resourceType, String path, String query) {
        String normalizedPath = normalizePath(path);
        String encodedPath = encodePath(normalizedPath);
        String resource = resolveResource(resourceType);

        String server = trimTrailingSlash(configuration.getServer());
        String appContext = trimSlashes(configuration.getAppContext());
        String version = trimSlashes(configuration.getVersion());

        String target = String.format("%s/%s/api/%s/%s/%s", server, appContext, resource, version, encodedPath);
        if (query == null || query.isEmpty()) {
            return target;
        }

        return target + "?" + query;
    }

    private String resolveResource(EfficyResourceType resourceType) {
        switch (resourceType) {
            case ADVANCED:
                return trimSlashes(configuration.getAdvancedResource());
            case BASE:
                return trimSlashes(configuration.getBaseResource());
            case SERVICE:
                return trimSlashes(configuration.getServiceResource());
            default:
                throw new IllegalArgumentException("Unsupported resource type");
        }
    }

    private String normalizePath(String path) {
        if (path == null || path.trim().isEmpty()) {
            throw new IllegalArgumentException("Missing Efficy path");
        }

        String normalized = trimSlashes(path);
        if (normalized.contains("..")) {
            throw new IllegalArgumentException("Efficy path contains invalid segments");
        }

        return normalized;
    }

    private String encodePath(String path) {
        try {
            return new URI(null, null, "/" + path, null).toASCIIString().substring(1);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Invalid Efficy path", e);
        }
    }

    private static String trimSlashes(String value) {
        return value.replaceAll("^/+", "").replaceAll("/+$", "");
    }

    private static String trimTrailingSlash(String value) {
        return value.replaceAll("/+$", "");
    }

    private static boolean supportsBody(String method) {
        return "POST".equalsIgnoreCase(method)
                || "PUT".equalsIgnoreCase(method);
    }
}
