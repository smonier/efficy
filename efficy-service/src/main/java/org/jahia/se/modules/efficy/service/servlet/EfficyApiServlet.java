package org.jahia.se.modules.efficy.service.servlet;

import org.jahia.bin.filters.AbstractServletFilter;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.usermanager.JahiaUser;
import org.jahia.se.modules.efficy.service.config.EfficyServiceConfiguration;
import org.jahia.se.modules.efficy.service.model.EfficyGatewayResponse;
import org.jahia.se.modules.efficy.service.model.EfficyResourceType;
import org.jahia.se.modules.efficy.service.spi.EfficyAuthenticationService;
import org.jahia.se.modules.efficy.service.spi.EfficyDemandesService;
import org.jahia.se.modules.efficy.service.spi.EfficyGatewayService;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

@Component(service = AbstractServletFilter.class)
public class EfficyApiServlet extends AbstractServletFilter {

    private static final String API_ROOT = "/modules/efficy-service/api/v1";
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final Set<String> SUPPORTED_METHODS = Set.of("GET", "POST", "PUT", "DELETE");

    @Reference
    private EfficyServiceConfiguration configuration;

    @Reference
    private EfficyAuthenticationService authenticationService;

    @Reference
    private EfficyGatewayService gatewayService;

    @Reference
    private EfficyDemandesService demandesService;

    @Activate
    protected void activate() {
        setUrlPatterns(new String[]{API_ROOT + "/*"});
    }

    @Override
    public void init(FilterConfig filterConfig) {
        // No servlet init logic required.
    }

    @Override
    public void destroy() {
        // No servlet cleanup required.
    }

    @Override
    public void doFilter(ServletRequest servletRequest,
                         ServletResponse servletResponse,
                         FilterChain filterChain) throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        String route = extractRoute(request);

        try {
            if (route.equals("/health") && "GET".equalsIgnoreCase(request.getMethod())) {
                writeJson(response, HttpServletResponse.SC_OK, "{\"status\":\"UP\"}");
                return;
            }

            if ("/me/demandes".equals(route) && "GET".equalsIgnoreCase(request.getMethod())) {
                handleDemandes(request, response);
                return;
            }

            if ("/me/person".equals(route) && "GET".equalsIgnoreCase(request.getMethod())) {
                handleCurrentPerson(request, response);
                return;
            }

            if (route.startsWith("/advanced/") || route.startsWith("/base/") || route.startsWith("/service/")) {
                handleProxy(request, response, route);
                return;
            }

            writeJsonError(response, HttpServletResponse.SC_NOT_FOUND, "Unknown endpoint");
        } catch (IllegalArgumentException ex) {
            writeJsonError(response, HttpServletResponse.SC_BAD_REQUEST, ex.getMessage());
        } catch (IOException ex) {
            writeJsonError(response, HttpServletResponse.SC_BAD_GATEWAY, "Efficy API communication failed");
        } catch (Exception ex) {
            writeJsonError(response, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "Unexpected server error");
        }
    }

    private void handleDemandes(HttpServletRequest request,
                                HttpServletResponse response) throws IOException {
        int requestedPageSize = parsePositiveInt(request.getParameter("pageSize"), DEFAULT_PAGE_SIZE);
        int pageSize = Math.min(requestedPageSize, configuration.getMaxPageSize());

        String authorization = authenticationService.resolveAuthorizationHeader(request);
        String userEmail = readUserEmail(request);

        EfficyGatewayResponse gatewayResponse = demandesService.fetchDemandesForCurrentUser(
                pageSize,
                authorization,
                userEmail
        );

        writeGatewayResponse(response, gatewayResponse);
    }

    private void handleCurrentPerson(HttpServletRequest request,
                                     HttpServletResponse response) throws IOException {
        String authorization = authenticationService.resolveAuthorizationHeader(request);
        String userEmail = readUserEmail(request);

        EfficyGatewayResponse gatewayResponse = demandesService.fetchCurrentUserPerson(
                authorization,
                userEmail
        );

        writeGatewayResponse(response, gatewayResponse);
    }

    private void handleProxy(HttpServletRequest request,
                             HttpServletResponse response,
                             String route) throws IOException {
        String method = request.getMethod().toUpperCase(Locale.ROOT);
        if (!SUPPORTED_METHODS.contains(method)) {
            writeJsonError(response, HttpServletResponse.SC_METHOD_NOT_ALLOWED, "Unsupported HTTP method");
            return;
        }

        String normalizedRoute = route.startsWith("/") ? route.substring(1) : route;
        int separatorIndex = normalizedRoute.indexOf('/');
        if (separatorIndex < 0) {
            throw new IllegalArgumentException("Invalid proxy route");
        }

        String typeSegment = normalizedRoute.substring(0, separatorIndex);
        String path = normalizedRoute.substring(separatorIndex + 1);

        EfficyResourceType resourceType = EfficyResourceType.fromPathSegment(typeSegment);
        if (resourceType == null) {
            throw new IllegalArgumentException("Unsupported resource type");
        }

        String body = supportsBody(method)
                ? new String(request.getInputStream().readAllBytes(), StandardCharsets.UTF_8)
                : null;

        String authorization = authenticationService.resolveAuthorizationHeader(request);
        String userEmail = readUserEmail(request);

        EfficyGatewayResponse gatewayResponse = gatewayService.forward(
                resourceType,
                path,
                request.getQueryString(),
                method,
                body,
                authorization,
                userEmail
        );

        writeGatewayResponse(response, gatewayResponse);
    }

    private String extractRoute(HttpServletRequest request) {
        String fullPath = request.getRequestURI();
        String contextPath = request.getContextPath();
        String path = fullPath.startsWith(contextPath)
                ? fullPath.substring(contextPath.length())
                : fullPath;

        String route = path.substring(API_ROOT.length());
        if (route.isEmpty()) {
            return "/";
        }

        return route;
    }

    private String readUserEmail(HttpServletRequest request) {
        String currentJahiaUserEmail = readCurrentJahiaUserEmail();
        if (currentJahiaUserEmail != null) {
            return currentJahiaUserEmail;
        }

        String value = request.getHeader("X-User-Email");
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String readCurrentJahiaUserEmail() {
        JahiaUser currentUser = JCRSessionFactory.getInstance().getCurrentUser();
        if (currentUser == null) {
            return null;
        }

        String value = currentUser.getProperty("j:email");
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static boolean supportsBody(String method) {
        return "POST".equals(method) || "PUT".equals(method);
    }

    private int parsePositiveInt(String value, int defaultValue) {
        if (value == null || value.isEmpty()) {
            return defaultValue;
        }

        try {
            int parsed = Integer.parseInt(value);
            return parsed > 0 ? parsed : defaultValue;
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }

    private void writeGatewayResponse(HttpServletResponse response,
                                      EfficyGatewayResponse gatewayResponse) throws IOException {
        response.setStatus(gatewayResponse.getStatus());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(gatewayResponse.getContentType());
        response.getWriter().write(gatewayResponse.getBody());
    }

    private void writeJson(HttpServletResponse response,
                           int status,
                           String payload) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(payload);
    }

    private void writeJsonError(HttpServletResponse response,
                                int status,
                                String message) throws IOException {
        writeJson(response, status, "{\"error\":\"" + escapeJson(message) + "\"}");
    }

    private String escapeJson(String message) {
        return message.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
