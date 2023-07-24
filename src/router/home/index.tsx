import { Navigate } from 'react-router-dom'

import { getRoutePath, Route } from '../path'

export default () => <Navigate to={getRoutePath(Route.ANIME)}/>
