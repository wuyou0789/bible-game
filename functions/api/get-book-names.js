// functions/api/get-book-names.js
export async function onRequest(context) {
  const { env } = context;
  try {
    const bookNamesObj = await env.BIBLE_DATA_BUCKET.get('book_names.json');
    if (!bookNamesObj) {
      return new Response('Book names not found', { status: 404 });
    }
    // 直接将R2对象的内容作为响应返回
    return new Response(bookNamesObj.body, {
      headers: {
        'Content-Type': 'application/json',
        // 我们可以给它一个很长的缓存时间，因为它几乎不变
        'Cache-Control': 'public, max-age=86400' // 缓存一天
      }
    });
  } catch (error) {
    return new Response('Error fetching book names', { status: 500 });
  }
}