/**
 * Where to write to about this site.
 *
 * One constant rather than the string typed into three pages, because `/legal`,
 * `/privacy` and `/terms` each publish it and three copies is three chances for
 * two of them to be right. It changes in one place the day there is a domain and
 * an address on it.
 *
 * It exists at all because it did not: all three pages used to say *"use the
 * contact address published in the project repository"* and the repository
 * published none — a circular reference pointing at nothing. Three things needed
 * it. A privacy policy has to make whoever holds the data reachable; `/legal`
 * invites requests from rights holders and gave them no route to make one; and
 * both of those URLs were handed to the OAuth providers as the terms a person
 * agrees to when they sign in.
 */
export const CONTACT_EMAIL = 'tdk8gb93@gmail.com';

/** `mailto:` form, so no page builds the scheme itself and gets it subtly wrong. */
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;
