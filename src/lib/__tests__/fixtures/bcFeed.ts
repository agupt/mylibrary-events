/** Trimmed-down copy of a real Oakland Public Library BiblioCommons feed. */
export const BC_FEED_FIXTURE = `<?xml version="1.0" encoding="UTF-8" ?>
<rss xmlns:bc="http://bibliocommons.com/rss/1.0/modules/event/" version="2.0">
  <channel>
    <title>Events | Test Library</title>
    <item>
      <title>Toddler Storytime</title>
      <description><![CDATA[<p>Songs &amp; stories for little ones.&nbsp;</p>]]></description>
      <link>https://example.bibliocommons.com/events/aaa111</link>
      <guid>https://example.bibliocommons.com/events/aaa111</guid>
      <bc:start_date>2026-07-15T17:30:00Z</bc:start_date>
      <bc:end_date>2026-07-15T18:00:00Z</bc:end_date>
      <bc:is_cancelled>false</bc:is_cancelled>
      <category domain="Type">Storytimes</category>
      <category domain="Audience">Toddlers</category>
      <bc:location>
        <bc:name>Rockridge Branch</bc:name><bc:zip>94618</bc:zip>
      </bc:location>
    </item>
    <item>
      <title>Adult Tax Help</title>
      <description><![CDATA[Drop-in tax assistance.]]></description>
      <link>https://example.bibliocommons.com/events/bbb222</link>
      <bc:start_date>2026-07-15T20:00:00Z</bc:start_date>
      <bc:end_date>2026-07-15T21:00:00Z</bc:end_date>
      <bc:is_cancelled>false</bc:is_cancelled>
      <category domain="Audience">Adults</category>
      <bc:location>
        <bc:name>Rockridge Branch</bc:name><bc:zip>94618</bc:zip>
      </bc:location>
    </item>
    <item>
      <title>Cancelled Craft Hour</title>
      <description><![CDATA[Won't happen.]]></description>
      <link>https://example.bibliocommons.com/events/ccc333</link>
      <bc:start_date>2026-07-16T17:00:00Z</bc:start_date>
      <bc:end_date>2026-07-16T18:00:00Z</bc:end_date>
      <bc:is_cancelled>true</bc:is_cancelled>
      <category domain="Audience">Kids</category>
      <bc:location>
        <bc:name>Rockridge Branch</bc:name><bc:zip>94618</bc:zip>
      </bc:location>
    </item>
    <item>
      <title>Main Library Lego Club</title>
      <description><![CDATA[Build with us!]]></description>
      <link>https://example.bibliocommons.com/events/ddd444</link>
      <bc:start_date>2026-07-20T22:00:00Z</bc:start_date>
      <bc:end_date>2026-07-20T23:00:00Z</bc:end_date>
      <bc:is_cancelled>false</bc:is_cancelled>
      <category domain="Audience">Grade Schoolers</category>
      <bc:location>
        <bc:name>Main Library</bc:name><bc:zip>94612</bc:zip>
      </bc:location>
    </item>
    <item>
      <title>Out of Range Storytime</title>
      <description><![CDATA[Too far in the future.]]></description>
      <link>https://example.bibliocommons.com/events/eee555</link>
      <bc:start_date>2026-09-01T17:00:00Z</bc:start_date>
      <bc:end_date>2026-09-01T18:00:00Z</bc:end_date>
      <bc:is_cancelled>false</bc:is_cancelled>
      <category domain="Audience">Kids</category>
      <bc:location>
        <bc:name>Rockridge Branch</bc:name><bc:zip>94618</bc:zip>
      </bc:location>
    </item>
  </channel>
</rss>`;
