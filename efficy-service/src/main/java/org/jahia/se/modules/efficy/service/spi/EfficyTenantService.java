package org.jahia.se.modules.efficy.service.spi;

import org.jahia.se.modules.efficy.service.model.EfficyGatewayResponse;

import java.io.IOException;

/**
 * Everything the portal needs to describe the signed-in tenant, in one round trip.
 *
 * Resolves the Jahia user to their Efficy {@code Person}, then follows the housing model from
 * there: the residence ({@code ProductFamily}, via {@code PerPrfID_}), the dwelling
 * ({@code Product}, via {@code PerPrdID_}), the leases ({@code Opportunity}, via
 * {@code OppPerID}), the household (every {@code Person} sharing the tenant's {@code PerEntID},
 * an enterprise of type Foyer) and the residence's named contacts ({@code Actor}, via {@code PrfActID2_}
 * and {@code PrfActID3_}).
 *
 * The response is a composite of Efficy's own payloads, passed through untouched under one key
 * each, so the browser reads them with the same field readers it already uses for every other
 * Efficy object. A part that cannot be read is {@code null}, never a failure of the whole: an
 * instance whose Person object carries no housing fields at all still answers with the person.
 *
 * Threading: stateless apart from the injected gateway; safe to call from any request thread.
 */
public interface EfficyTenantService {

    /**
     * @param authorizationHeader the caller's Authorization header, forwarded when the gateway
     *                            is configured to do so; may be {@code null}
     * @param userEmail           the signed-in Jahia user's email, matched against {@code PerMail}
     * @return 200 with the composite body, 404 when no Efficy person carries that email
     * @throws IOException              when Efficy cannot be reached at all
     * @throws IllegalArgumentException when the email is missing or malformed
     */
    EfficyGatewayResponse fetchCurrentUserTenant(String authorizationHeader,
                                                 String userEmail) throws IOException;

    /**
     * The signed-in tenant's payments - every {@code Paiement_} whose {@code Pa_Person} is
     * them - with the requests those payments point at.
     *
     * {@code Paiement_} carries a date, an amount, a state ("A régler" / "Réglé"), the lease and
     * optionally a request ({@code Pa_Demande}). It has no label field: the linked request is the
     * only place that says what a line is FOR ("Régularisation annuelle des charges"), so each
     * distinct request is fetched and returned alongside, keyed by its id.
     *
     * Efficy returns the rows oldest first and ignores ordering parameters; the whole set is
     * returned for the client to sort. On an instance that never generated the object the
     * {@code payments} part is {@code null}, and the person is still answered.
     *
     * @param authorizationHeader the caller's Authorization header; may be {@code null}
     * @param userEmail           the signed-in Jahia user's email, matched against {@code PerMail}
     * @return 200 with {@code {person, payments, demandes, resolved}}, 404 when no person carries
     *         that email
     * @throws IOException              when Efficy cannot be reached at all
     * @throws IllegalArgumentException when the email is missing or malformed
     */
    EfficyGatewayResponse fetchCurrentUserPayments(String authorizationHeader,
                                                   String userEmail) throws IOException;
}
