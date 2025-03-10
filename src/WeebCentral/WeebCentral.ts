import {
    SourceManga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    SourceInfo,
    TagSection,
    ContentRating,
    Request,
    Response,
    SourceIntents,
    SearchResultsProviding,
    ChapterProviding,
    MangaProviding,
    HomePageSectionsProviding,
    Tag
} from '@paperback/types'

import * as cheerio from 'cheerio'

import {
    isLastPage,
    parseTags,
    parseChapterDetails,
    parseChapters,
    parseHomeSections,
    parseMangaDetails,
    parseSearch,
    parseViewMore
} from './WeebCentralParser'

const WC_DOMAIN = 'https://www.weebcentral.com'

export const WeebCentralInfo: SourceInfo = {
    version: '3.0.5',
    name: 'WeebCentral',
    icon: 'icon.jpeg',
    author: 'Plancktron',
    authorWebsite: 'https://github.com/Plancktron',
    description: 'Extension that pulls manga from weebcentral.com',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: WC_DOMAIN,
    sourceTags: [],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class WeebCentral implements SearchResultsProviding, MangaProviding, ChapterProviding, HomePageSectionsProviding {

    requestManager = App.createRequestManager({
        requestsPerSecond: 10,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    ...{
                        'referer': `${WC_DOMAIN}/`,
                        'user-agent': await this.requestManager.getDefaultUserAgent()
                    }
                }, request.cookies = [
                    App.createCookie({ name: 'isAdult', value: '1', domain: 'www.weebcentral.com' })
                ]
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    });

    getMangaShareUrl(mangaId: string): string { return `${WC_DOMAIN}/manga/${mangaId}` }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${WC_DOMAIN}/manga/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        return parseMangaDetails($, mangaId)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = App.createRequest({
            url: `${WC_DOMAIN}/manga/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        return parseChapters($, mangaId)
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = App.createRequest({
            url: `${WC_DOMAIN}/manga/${mangaId}/${chapterId}/1.html`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        return parseChapterDetails($, mangaId, chapterId, request.url, this)
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const request = App.createRequest({
            url: WC_DOMAIN,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        parseHomeSections($, sectionCallback)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        let param = ''

        switch (homepageSectionId) {
            case 'hot_release':
                param = 'hot'
                break
            case 'new_manga':
                param = `directory/${page}.htm?news`
                break
            case 'latest_updates':
                param = `latest/${page}`
                break
            default:
                throw new Error(`Invalid homeSectionId | ${homepageSectionId}`)
        }

        const request = App.createRequest({
            url: `${WC_DOMAIN}/${param}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        const manga = parseViewMore($, homepageSectionId)

        metadata = !isLastPage($) ? { page: page + 1 } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1

        const url = new URLBuilder(WC_DOMAIN)
            .addPathComponent('search')
            .addQueryParameter('page', page)
            .addQueryParameter('title', encodeURI(query?.title || ''))
            .addQueryParameter('genres', query.includedTags?.map((x: Tag) => x.id).join('%2C'))
            .buildUrl()

        const request = App.createRequest({
            url: url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        const manga = parseSearch($)

        metadata = !isLastPage($) ? { page: page + 1 } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const request = App.createRequest({
            url: `${WC_DOMAIN}/search?`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        return parseTags($)
    }
}
