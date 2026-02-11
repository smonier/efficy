package org.jahia.se.modules.efficy.service.internal;

import org.jahia.se.modules.efficy.service.config.EfficyServiceConfiguration;
import org.jahia.se.modules.efficy.service.spi.EfficyAuthenticationService;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

import javax.servlet.http.HttpServletRequest;

@Component(service = EfficyAuthenticationService.class)
public class DefaultEfficyAuthenticationService implements EfficyAuthenticationService {

    @Reference
    private EfficyServiceConfiguration configuration;

    @Override
    public String resolveAuthorizationHeader(HttpServletRequest request) {
        if (configuration.isForwardClientAuthorization()) {
            String incomingAuthorization = request.getHeader("Authorization");
            if (incomingAuthorization != null && !incomingAuthorization.trim().isEmpty()) {
                return incomingAuthorization.trim();
            }
        }

        String configuredToken = configuration.getToken();
        if (configuredToken == null) {
            throw new IllegalStateException("Missing Efficy token configuration");
        }

        String token = configuredToken.trim();
        if (token.isEmpty()) {
            throw new IllegalStateException("Missing Efficy token configuration");
        }

        // Keep the configured value verbatim to match legacy/reference module behavior.
        // Some Efficy environments expect a raw token, others may include a scheme.
        return token;
    }
}
